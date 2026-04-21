import type { PoolClient } from "pg";
import type { IDoctorsRepository } from "../interfaces/IDoctorsRepository";
import type {
  Doctor,
  DoctorCreateInput,
  DoctorUpdateInput,
} from "../interfaces/coreTypes";
import { dbPool } from "../../config/database";

type DoctorDbRow = {
  id: number | string;
  full_name: string;
  specialty: string;
  percent: string | number;
  phone: string | null;
  birth_date: string | Date | null;
  active: boolean;
  created_at: Date | string;
};

const toIso = (value: Date | string): string => {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

const num = (v: string | number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapRow = (row: DoctorDbRow, serviceIds: number[]): Doctor => ({
  id: Number(row.id),
  name: row.full_name.trim(),
  speciality: row.specialty.trim(),
  percent: num(row.percent),
  phone: row.phone,
  birth_date: row.birth_date
    ? (row.birth_date instanceof Date
        ? row.birth_date.toISOString().slice(0, 10)
        : String(row.birth_date).slice(0, 10))
    : null,
  active: row.active !== false,
  serviceIds,
  createdAt: toIso(row.created_at),
});

const loadServiceIds = async (
  client: PoolClient | typeof dbPool,
  doctorId: number
): Promise<number[]> => {
  const result = await client.query<{ service_id: string | number }>(
    `
      SELECT ds.service_id
      FROM doctor_services ds
      INNER JOIN services s ON s.id = ds.service_id AND s.active = true AND s.deleted_at IS NULL
      WHERE ds.doctor_id = $1
      ORDER BY ds.service_id
    `,
    [doctorId]
  );
  return result.rows.map((r) => Number(r.service_id));
};

const replaceDoctorServices = async (
  client: PoolClient,
  doctorId: number,
  serviceIds: number[]
): Promise<void> => {
  await client.query(`DELETE FROM doctor_services WHERE doctor_id = $1`, [doctorId]);
  for (const serviceId of serviceIds) {
    await client.query(
      `INSERT INTO doctor_services (doctor_id, service_id) VALUES ($1, $2)`,
      [doctorId, serviceId]
    );
  }
};

export class PostgresDoctorsRepository implements IDoctorsRepository {
  async findAll(): Promise<Doctor[]> {
    const result = await dbPool.query<DoctorDbRow & { service_ids: number[] | null }>(
      `
        SELECT
          d.id,
          d.full_name,
          d.specialty,
          d.percent,
          d.phone,
          d.birth_date,
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
          d.phone,
          d.birth_date,
          d.active,
          d.created_at
        ORDER BY d.full_name ASC
      `
    );

    return result.rows.map((row) => {
      const { service_ids: rawIds, ...doctorRow } = row;
      const ids = (rawIds ?? []).map((id) => Number(id));
      return mapRow(doctorRow, ids);
    });
  }

  async findById(id: number): Promise<Doctor | null> {
    const result = await dbPool.query<DoctorDbRow>(
      `
        SELECT
          id,
          full_name,
          specialty,
          percent,
          phone,
          birth_date,
          active,
          created_at
        FROM doctors
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    const serviceIds = await loadServiceIds(dbPool, id);
    return mapRow(result.rows[0], serviceIds);
  }

  async create(data: DoctorCreateInput): Promise<Doctor> {
    const fullName = data.name.trim();
    const spec = data.speciality.trim();
    const serviceIds = data.serviceIds ?? [];

    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await client.query<DoctorDbRow>(
        `
          INSERT INTO doctors (full_name, specialty, percent, phone, birth_date, active)
          VALUES ($1, $2, $3, $4, $5::date, $6)
          RETURNING
            id,
            full_name,
            specialty,
            percent,
            phone,
            birth_date,
            active,
            created_at
        `,
        [fullName, spec, data.percent, data.phone ?? null, data.birth_date ?? null, data.active]
      );

      const row = insertResult.rows[0];
      const doctorId = Number(row.id);
      await replaceDoctorServices(client, doctorId, serviceIds);

      await client.query("COMMIT");
      return mapRow(row, serviceIds);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: number, data: DoctorUpdateInput): Promise<Doctor | null> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<DoctorDbRow>(
        `
          SELECT id, full_name, specialty, percent, phone, birth_date, active, created_at
          FROM doctors
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const setClauses: string[] = [];
      const values: Array<string | number | boolean | null> = [];

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

      if (data.phone !== undefined) {
        values.push(data.phone);
        setClauses.push(`phone = $${values.length}`);
      }

      if (data.birth_date !== undefined) {
        values.push(data.birth_date);
        setClauses.push(`birth_date = $${values.length}::date`);
      }

      if (data.active !== undefined) {
        values.push(data.active);
        setClauses.push(`active = $${values.length}`);
      }

      if (setClauses.length > 0) {
        values.push(id);
        const updateResult = await client.query<DoctorDbRow>(
          `
            UPDATE doctors
            SET ${setClauses.join(", ")}
            WHERE id = $${values.length}
            RETURNING
              id,
              full_name,
              specialty,
              percent,
              phone,
              birth_date,
              active,
              created_at
          `,
          values
        );
        if (updateResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return null;
        }
      }

      let serviceIds: number[];
      if (data.serviceIds !== undefined) {
        await replaceDoctorServices(client, id, data.serviceIds);
        serviceIds = data.serviceIds;
      } else {
        serviceIds = await loadServiceIds(client, id);
      }

      const finalRow = await client.query<DoctorDbRow>(
        `
          SELECT id, full_name, specialty, percent, phone, birth_date, active, created_at
          FROM doctors
          WHERE id = $1
        `,
        [id]
      );

      await client.query("COMMIT");

      if (finalRow.rows.length === 0) {
        return null;
      }
      return mapRow(finalRow.rows[0], serviceIds);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const result = await dbPool.query<{ id: number }>(
      `UPDATE doctors SET active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }
}
