"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresServicesRepository = void 0;
const database_1 = require("../../config/database");
const errorHandler_1 = require("../../middleware/errorHandler");
const numbers_1 = require("../../utils/numbers");
const toIso = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    return new Date(value).toISOString();
};
const mapRow = (row) => ({
    id: Number(row.id),
    name: row.name,
    category: "other",
    price: (0, numbers_1.parseNonNegativeMoneyFromPg)(row.price),
    duration: (() => {
        const d = (0, numbers_1.parseNumericInput)(row.duration);
        return d != null && d > 0 ? Math.round(d) : 1;
    })(),
    active: row.active !== false,
    doctorIds: (row.doctor_ids ?? []).map((id) => Number(id)).sort((a, b) => a - b),
    createdAt: toIso(row.created_at),
});
const replaceServiceDoctors = async (client, serviceId, doctorIds) => {
    await client.query(`DELETE FROM doctor_services WHERE service_id = $1`, [serviceId]);
    const uniqueSorted = [...new Set(doctorIds)].sort((a, b) => a - b);
    for (const doctorId of uniqueSorted) {
        await client.query(`INSERT INTO doctor_services (doctor_id, service_id) VALUES ($1, $2)`, [doctorId, serviceId]);
    }
};
const assertDoctorsExist = async (client, doctorIds) => {
    if (doctorIds.length === 0)
        return;
    const unique = [...new Set(doctorIds)];
    const result = await client.query(`
      SELECT COUNT(*)::text AS c
      FROM doctors
      WHERE id = ANY($1::bigint[])
        AND deleted_at IS NULL
    `, [unique]);
    const count = Number(result.rows[0]?.c ?? 0);
    if (count !== unique.length) {
        throw new errorHandler_1.ApiError(400, "One or more doctorIds are invalid or deleted");
    }
};
const baseSelect = `
  SELECT
    s.id,
    s.name,
    s.price,
    s.duration,
    s.active,
    s.created_at,
    COALESCE(
      array_agg(ds.doctor_id::bigint ORDER BY ds.doctor_id)
        FILTER (WHERE ds.doctor_id IS NOT NULL),
      ARRAY[]::bigint[]
    ) AS doctor_ids
  FROM services s
  LEFT JOIN doctor_services ds ON ds.service_id = s.id
`;
const groupByService = `
  GROUP BY
    s.id,
    s.name,
    s.price,
    s.duration,
    s.active,
    s.created_at
`;
class PostgresServicesRepository {
    async findAll(filters = {}) {
        const conditions = ["s.deleted_at IS NULL"];
        const values = [];
        if (filters.activeOnly === true) {
            conditions.push("s.active = true");
        }
        if (filters.doctorId !== undefined) {
            values.push(filters.doctorId);
            conditions.push(`EXISTS (
          SELECT 1 FROM doctor_services ds2
          WHERE ds2.service_id = s.id AND ds2.doctor_id = $${values.length}
        )`);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const query = `
      ${baseSelect}
      ${where}
      ${groupByService}
      ORDER BY s.name ASC
    `;
        const result = await database_1.dbPool.query(query, values);
        return result.rows.map(mapRow);
    }
    async findById(id) {
        const result = await database_1.dbPool.query(`
        ${baseSelect}
        WHERE s.id = $1 AND s.deleted_at IS NULL
        ${groupByService}
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapRow(result.rows[0]);
    }
    async create(data) {
        const doctorIds = data.doctorIds ?? [];
        const name = data.name.trim();
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            await assertDoctorsExist(client, doctorIds);
            const insertResult = await client.query(`
          INSERT INTO services (name, price, duration, active)
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            name,
            price,
            duration,
            active,
            created_at,
            ARRAY[]::bigint[] AS doctor_ids
        `, [name, data.price, data.duration, data.active]);
            const row = insertResult.rows[0];
            const serviceId = Number(row.id);
            await replaceServiceDoctors(client, serviceId, doctorIds);
            await client.query("COMMIT");
            const loaded = await this.findById(serviceId);
            if (!loaded) {
                throw new errorHandler_1.ApiError(500, "Service created but could not be reloaded");
            }
            return loaded;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async update(id, data) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query(`SELECT id FROM services WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
            if (existing.rows.length === 0) {
                await client.query("ROLLBACK");
                return null;
            }
            if (data.doctorIds !== undefined) {
                await assertDoctorsExist(client, data.doctorIds);
            }
            const setClauses = [];
            const values = [];
            if (data.name !== undefined) {
                values.push(data.name.trim());
                setClauses.push(`name = $${values.length}`);
            }
            if (data.price !== undefined) {
                values.push(data.price);
                setClauses.push(`price = $${values.length}`);
            }
            if (data.duration !== undefined) {
                values.push(data.duration);
                setClauses.push(`duration = $${values.length}`);
            }
            if (data.active !== undefined) {
                values.push(data.active);
                setClauses.push(`active = $${values.length}`);
            }
            if (setClauses.length > 0) {
                values.push(id);
                const updateResult = await client.query(`
            UPDATE services
            SET ${setClauses.join(", ")}
            WHERE id = $${values.length}
            RETURNING id
          `, values);
                if (updateResult.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return null;
                }
            }
            if (data.doctorIds !== undefined) {
                await replaceServiceDoctors(client, id, data.doctorIds);
            }
            await client.query("COMMIT");
            return this.findById(id);
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async delete(id) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(`DELETE FROM services WHERE id = $1 RETURNING id`, [id]);
            if (result.rows.length === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            await client.query(`DELETE FROM doctor_services WHERE service_id = $1`, [id]);
            await client.query("COMMIT");
            return true;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async isServiceAssignedToDoctor(serviceId, doctorId) {
        const result = await database_1.dbPool.query(`
        SELECT EXISTS(
          SELECT 1
          FROM doctor_services ds
          INNER JOIN services s ON s.id = ds.service_id AND s.deleted_at IS NULL
          WHERE ds.service_id = $1
            AND ds.doctor_id = $2
        ) AS exists
      `, [serviceId, doctorId]);
        return result.rows[0]?.exists === true;
    }
}
exports.PostgresServicesRepository = PostgresServicesRepository;
