"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresNursesRepository = void 0;
const database_1 = require("../../config/database");
class PostgresNursesRepository {
    async findDoctorIdByUserId(userId) {
        const result = await database_1.dbPool.query(`SELECT doctor_id FROM nurses WHERE user_id = $1 LIMIT 1`, [userId]);
        if (result.rows.length === 0)
            return null;
        return Number(result.rows[0].doctor_id);
    }
    async upsert(userId, doctorId) {
        await database_1.dbPool.query(`
        INSERT INTO nurses (user_id, doctor_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET doctor_id = EXCLUDED.doctor_id
      `, [userId, doctorId]);
    }
    async deleteByUserId(userId) {
        await database_1.dbPool.query(`DELETE FROM nurses WHERE user_id = $1`, [userId]);
    }
}
exports.PostgresNursesRepository = PostgresNursesRepository;
