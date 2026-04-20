"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPatientsRepository = void 0;
const database_1 = require("../../config/database");
const toDateOnly = (value) => {
    if (value === null)
        return null;
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    return value.slice(0, 10);
};
const toIso = (value) => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return new Date(value).toISOString();
};
const mapPatientRow = (row) => ({
    id: Number(row.id),
    fullName: row.full_name,
    phone: row.phone,
    gender: row.gender,
    birthDate: toDateOnly(row.birth_date),
    source: mapSourceColumn(row.source),
    notes: row.notes ?? null,
    createdAt: toIso(row.created_at),
});
const PATIENT_SEARCH_LIMIT = 20;
const SOURCE_VALUES = new Set([
    "instagram",
    "telegram",
    "advertising",
    "referral",
    "other",
]);
const mapSourceColumn = (value) => {
    if (value === null || value === "")
        return null;
    return SOURCE_VALUES.has(value) ? value : null;
};
/** Escape %, _, \ for ILIKE ... ESCAPE '\' */
const wrapIlikeContainsPattern = (raw) => {
    const escaped = raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    return `%${escaped}%`;
};
const SELECT_LIST = `
  id,
  full_name,
  phone,
  gender,
  birth_date,
  source,
  notes,
  created_at
`;
/**
 * `pg` передаёт JS-массив в PostgreSQL как литерал массива; элементы вроде `NaN`, `undefined`, `""`
 * ломают приведение к `bigint[]` с ошибкой 22P02 (Invalid input syntax).
 */
function sanitizePositiveIntIdsForBigintArray(raw) {
    const positive = [];
    let droppedCount = 0;
    let hadNaN = false;
    for (const item of raw) {
        const n = Number(item);
        if (Number.isNaN(n)) {
            hadNaN = true;
            droppedCount++;
            continue;
        }
        if (Number.isInteger(n) && n > 0) {
            positive.push(n);
        }
        else {
            droppedCount++;
        }
    }
    const ids = [...new Set(positive)];
    return { ids, droppedCount, hadNaN };
}
class PostgresPatientsRepository {
    async findAll(filters = {}) {
        const incDel = filters.includeDeleted === true;
        const searchTerm = typeof filters.search === "string" ? filters.search.trim() : "";
        const hasSearch = searchTerm.length > 0;
        if (filters.ids !== undefined) {
            if (filters.ids.length === 0) {
                return [];
            }
            const { ids: safeIds, droppedCount, hadNaN } = sanitizePositiveIntIdsForBigintArray(filters.ids);
            if (droppedCount > 0) {
                // eslint-disable-next-line no-console -- защита от «плохих» id в ANY(bigint[]); см. sanitize выше
                console.warn(`[PostgresPatientsRepository] Dropped ${droppedCount} invalid patient id(s) before ANY($1::bigint[])${hadNaN ? " (NaN present)" : ""}`);
            }
            if (safeIds.length === 0) {
                return [];
            }
            if (hasSearch) {
                const pattern = wrapIlikeContainsPattern(searchTerm);
                const scopedResult = await database_1.dbPool.query(`
            SELECT ${SELECT_LIST}
            FROM patients
            WHERE id = ANY($1::bigint[])
            AND deleted_at IS NULL
            AND (
              full_name ILIKE $2 ESCAPE '\\'
              OR phone ILIKE $2 ESCAPE '\\'
              OR (
                char_length(regexp_replace($3::text, '[^0-9]', '', 'g')) >= 3
                AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
                  LIKE (
                    '%'
                    || regexp_replace($3::text, '[^0-9]', '', 'g')
                    || '%'
                  )
              )
            )
            ORDER BY created_at DESC
            LIMIT ${PATIENT_SEARCH_LIMIT}
          `, [safeIds, pattern, searchTerm]);
                return scopedResult.rows.map(mapPatientRow);
            }
            const scopedResult = await database_1.dbPool.query(`
          SELECT ${SELECT_LIST}
          FROM patients
          WHERE id = ANY($1::bigint[])
          ${incDel ? "" : "AND deleted_at IS NULL"}
          ORDER BY created_at DESC
        `, [safeIds]);
            return scopedResult.rows.map(mapPatientRow);
        }
        if (hasSearch) {
            const pattern = wrapIlikeContainsPattern(searchTerm);
            const result = await database_1.dbPool.query(`
          SELECT ${SELECT_LIST}
          FROM patients
          WHERE deleted_at IS NULL
          AND (
            full_name ILIKE $1 ESCAPE '\\'
            OR phone ILIKE $1 ESCAPE '\\'
            OR (
              char_length(regexp_replace($2::text, '[^0-9]', '', 'g')) >= 3
              AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
                LIKE (
                  '%'
                  || regexp_replace($2::text, '[^0-9]', '', 'g')
                  || '%'
                )
            )
          )
          ORDER BY created_at DESC
          LIMIT ${PATIENT_SEARCH_LIMIT}
        `, [pattern, searchTerm]);
            return result.rows.map(mapPatientRow);
        }
        const result = await database_1.dbPool.query(`
      SELECT ${SELECT_LIST}
      FROM patients
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
        return result.rows.map(mapPatientRow);
    }
    /** По id — в т.ч. архивный (история, просмотр по прямой ссылке). */
    async findById(id) {
        const result = await database_1.dbPool.query(`
        SELECT ${SELECT_LIST}
        FROM patients
        WHERE id = $1
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapPatientRow(result.rows[0]);
    }
    async create(data) {
        const result = await database_1.dbPool.query(`
        INSERT INTO patients (
          full_name,
          phone,
          gender,
          birth_date,
          source,
          notes
        )
        VALUES ($1, $2, $3, $4::date, $5, $6)
        RETURNING ${SELECT_LIST}
      `, [data.fullName, data.phone, data.gender, data.birthDate, data.source ?? null, data.notes ?? null]);
        return mapPatientRow(result.rows[0]);
    }
    async update(id, data) {
        const setClauses = [];
        const values = [];
        if (data.fullName !== undefined) {
            values.push(data.fullName);
            setClauses.push(`full_name = $${values.length}`);
        }
        if (data.phone !== undefined) {
            values.push(data.phone);
            setClauses.push(`phone = $${values.length}`);
        }
        if (data.gender !== undefined) {
            values.push(data.gender);
            setClauses.push(`gender = $${values.length}`);
        }
        if (data.birthDate !== undefined) {
            values.push(data.birthDate);
            setClauses.push(`birth_date = $${values.length}::date`);
        }
        if (data.source !== undefined) {
            values.push(data.source);
            setClauses.push(`source = $${values.length}`);
        }
        if (data.notes !== undefined) {
            values.push(data.notes);
            setClauses.push(`notes = $${values.length}`);
        }
        if (setClauses.length === 0) {
            return this.findById(id);
        }
        values.push(id);
        const result = await database_1.dbPool.query(`
        UPDATE patients
        SET ${setClauses.join(", ")}
        WHERE id = $${values.length} AND deleted_at IS NULL
        RETURNING ${SELECT_LIST}
      `, values);
        if (result.rows.length === 0) {
            return null;
        }
        return mapPatientRow(result.rows[0]);
    }
    async delete(id) {
        const result = await database_1.dbPool.query(`
        UPDATE patients
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [id]);
        return result.rows.length > 0;
    }
}
exports.PostgresPatientsRepository = PostgresPatientsRepository;
