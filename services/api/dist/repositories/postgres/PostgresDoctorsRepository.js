"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDoctorsRepository = void 0;
const database_1 = require("../../config/database");
const toIso = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    return new Date(value).toISOString();
};
const num = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
};
const mapRow = (row, serviceIds) => ({
    id: Number(row.id),
    name: row.full_name.trim(),
    speciality: row.specialty.trim(),
    percent: num(row.percent),
    active: row.active !== false,
    serviceIds,
    createdAt: toIso(row.created_at),
});
const loadServiceIds = async (client, doctorId) => {
    const result = await client.query(`
      SELECT ds.service_id
      FROM doctor_services ds
      INNER JOIN services s ON s.id = ds.service_id AND s.active = true AND s.deleted_at IS NULL
      WHERE ds.doctor_id = $1
      ORDER BY ds.service_id
    `, [doctorId]);
    return result.rows.map((r) => Number(r.service_id));
};
const replaceDoctorServices = async (client, doctorId, serviceIds) => {
    await client.query(`DELETE FROM doctor_services WHERE doctor_id = $1`, [doctorId]);
    for (const serviceId of serviceIds) {
        await client.query(`INSERT INTO doctor_services (doctor_id, service_id) VALUES ($1, $2)`, [doctorId, serviceId]);
    }
};
class PostgresDoctorsRepository {
    async findAll() {
        const result = await database_1.dbPool.query(`
        SELECT
          d.id,
          d.full_name,
          d.specialty,
          d.percent,
          d.active,
          d.created_at,
          COALESCE(
            array_agg(svc.id::bigint ORDER BY svc.id)
              FILTER (WHERE svc.id IS NOT NULL),
            ARRAY[]::bigint[]
          ) AS service_ids
        FROM doctors d
        LEFT JOIN doctor_services ds ON ds.doctor_id = d.id
        LEFT JOIN services svc ON svc.id = ds.service_id AND svc.deleted_at IS NULL
        GROUP BY
          d.id,
          d.full_name,
          d.specialty,
          d.percent,
          d.active,
          d.created_at
        ORDER BY d.full_name ASC
      `);
        return result.rows.map((row) => {
            const { service_ids: rawIds, ...doctorRow } = row;
            const ids = (rawIds ?? []).map((id) => Number(id));
            return mapRow(doctorRow, ids);
        });
    }
    async findById(id) {
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          full_name,
          specialty,
          percent,
          active,
          created_at
        FROM doctors
        WHERE id = $1
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        const serviceIds = await loadServiceIds(database_1.dbPool, id);
        return mapRow(result.rows[0], serviceIds);
    }
    async create(data) {
        const fullName = data.name.trim();
        const spec = data.speciality.trim();
        const serviceIds = data.serviceIds ?? [];
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const insertResult = await client.query(`
          INSERT INTO doctors (full_name, specialty, percent, active)
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            full_name,
            specialty,
            percent,
            active,
            created_at
        `, [fullName, spec, data.percent, data.active]);
            const row = insertResult.rows[0];
            const doctorId = Number(row.id);
            await replaceDoctorServices(client, doctorId, serviceIds);
            await client.query("COMMIT");
            return mapRow(row, serviceIds);
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
            const existing = await client.query(`
          SELECT id, full_name, specialty, percent, active, created_at
          FROM doctors
          WHERE id = $1
          FOR UPDATE
        `, [id]);
            if (existing.rows.length === 0) {
                await client.query("ROLLBACK");
                return null;
            }
            const setClauses = [];
            const values = [];
            if (data.name !== undefined) {
                values.push(data.name.trim());
                setClauses.push(`full_name = $${values.length}`);
            }
            if (data.speciality !== undefined) {
                values.push(data.speciality.trim());
                setClauses.push(`specialty = $${values.length}`);
            }
            if (data.percent !== undefined) {
                values.push(data.percent);
                setClauses.push(`percent = $${values.length}`);
            }
            if (data.active !== undefined) {
                values.push(data.active);
                setClauses.push(`active = $${values.length}`);
            }
            if (setClauses.length > 0) {
                values.push(id);
                const updateResult = await client.query(`
            UPDATE doctors
            SET ${setClauses.join(", ")}
            WHERE id = $${values.length}
            RETURNING
              id,
              full_name,
              specialty,
              percent,
              active,
              created_at
          `, values);
                if (updateResult.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return null;
                }
            }
            let serviceIds;
            if (data.serviceIds !== undefined) {
                await replaceDoctorServices(client, id, data.serviceIds);
                serviceIds = data.serviceIds;
            }
            else {
                serviceIds = await loadServiceIds(client, id);
            }
            const finalRow = await client.query(`
          SELECT id, full_name, specialty, percent, active, created_at
          FROM doctors
          WHERE id = $1
        `, [id]);
            await client.query("COMMIT");
            if (finalRow.rows.length === 0) {
                return null;
            }
            return mapRow(finalRow.rows[0], serviceIds);
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
        const result = await database_1.dbPool.query(`UPDATE doctors SET active = false WHERE id = $1 RETURNING id`, [id]);
        return result.rows.length > 0;
    }
}
exports.PostgresDoctorsRepository = PostgresDoctorsRepository;
