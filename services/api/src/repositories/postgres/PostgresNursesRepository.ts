import type { INursesRepository } from "../interfaces/INursesRepository";
import { dbPool } from "../../config/database";
import { requireClinicId } from "../../tenancy/clinicContext";

export class PostgresNursesRepository implements INursesRepository {
  async findDoctorIdByUserId(userId: number): Promise<number | null> {
    const clinicId = requireClinicId();
    const result = await dbPool.query<{ doctor_id: number }>(
      `SELECT doctor_id FROM nurses WHERE user_id = $1 AND clinic_id = $2 LIMIT 1`,
      [userId, clinicId]
    );
    if (result.rows.length === 0) return null;
    return Number(result.rows[0].doctor_id);
  }

  async upsert(userId: number, doctorId: number): Promise<void> {
    const clinicId = requireClinicId();
    await dbPool.query(
      `
        INSERT INTO nurses (clinic_id, user_id, doctor_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET doctor_id = EXCLUDED.doctor_id, clinic_id = EXCLUDED.clinic_id
      `,
      [clinicId, userId, doctorId]
    );
  }

  async deleteByUserId(userId: number): Promise<void> {
    const clinicId = requireClinicId();
    await dbPool.query(`DELETE FROM nurses WHERE user_id = $1 AND clinic_id = $2`, [userId, clinicId]);
  }
}
