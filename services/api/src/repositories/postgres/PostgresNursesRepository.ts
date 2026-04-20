import type { INursesRepository } from "../interfaces/INursesRepository";
import { dbPool } from "../../config/database";

export class PostgresNursesRepository implements INursesRepository {
  async findDoctorIdByUserId(userId: number): Promise<number | null> {
    const result = await dbPool.query<{ doctor_id: number }>(
      `SELECT doctor_id FROM nurses WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return Number(result.rows[0].doctor_id);
  }

  async upsert(userId: number, doctorId: number): Promise<void> {
    await dbPool.query(
      `
        INSERT INTO nurses (user_id, doctor_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET doctor_id = EXCLUDED.doctor_id
      `,
      [userId, doctorId]
    );
  }

  async deleteByUserId(userId: number): Promise<void> {
    await dbPool.query(`DELETE FROM nurses WHERE user_id = $1`, [userId]);
  }
}
