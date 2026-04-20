"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresUsersRepository = void 0;
const database_1 = require("../../config/database");
const toIso = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    return new Date(value).toISOString();
};
const normalizeUsername = (username) => username.trim().toLowerCase();
const mapRow = (row) => ({
    id: Number(row.id),
    username: row.username,
    password: row.password_hash,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    doctorId: row.doctor_id === undefined || row.doctor_id === null
        ? null
        : Number(row.doctor_id),
    lastLoginAt: row.last_login_at ? toIso(row.last_login_at) : null,
    failedLoginAttempts: row.failed_login_attempts == null ? 0 : Number(row.failed_login_attempts),
    lockedUntil: row.locked_until ? toIso(row.locked_until) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
});
const SELECT_FIELDS = `
  u.id,
  u.username,
  u.password_hash,
  COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS full_name,
  u.role,
  COALESCE(u.is_active, true) AS is_active,
  u.last_login_at,
  COALESCE(u.failed_login_attempts, 0) AS failed_login_attempts,
  u.locked_until,
  u.created_at,
  COALESCE(u.updated_at, u.created_at) AS updated_at,
  u.deleted_at,
  u.doctor_id
`;
const RETURNING_FIELDS = `
  id,
  username,
  password_hash,
  COALESCE(NULLIF(TRIM(full_name), ''), username) AS full_name,
  role,
  COALESCE(is_active, true) AS is_active,
  last_login_at,
  COALESCE(failed_login_attempts, 0) AS failed_login_attempts,
  locked_until,
  created_at,
  COALESCE(updated_at, created_at, NOW()) AS updated_at,
  deleted_at,
  doctor_id
`;
class PostgresUsersRepository {
    async findAll(filters = {}) {
        const clauses = ["u.deleted_at IS NULL"];
        const values = [];
        if (filters.role !== undefined) {
            values.push(filters.role);
            clauses.push(`u.role = $${values.length}`);
        }
        if (filters.isActive !== undefined) {
            values.push(filters.isActive);
            clauses.push(`COALESCE(u.is_active, true) = $${values.length}`);
        }
        if (filters.search !== undefined && filters.search.trim() !== "") {
            values.push(`%${filters.search.trim()}%`);
            const p = `$${values.length}`;
            clauses.push(`(u.username ILIKE ${p} OR COALESCE(u.full_name, '') ILIKE ${p})`);
        }
        const result = await database_1.dbPool.query(`
        SELECT ${SELECT_FIELDS}
        FROM users u
        WHERE ${clauses.join(" AND ")}
        ORDER BY u.created_at DESC
      `, values);
        return result.rows.map(mapRow);
    }
    async findById(id) {
        const result = await database_1.dbPool.query(`
        SELECT ${SELECT_FIELDS}
        FROM users u
        WHERE u.id = $1 AND u.deleted_at IS NULL
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async findByUsername(username) {
        const normalized = normalizeUsername(username);
        const result = await database_1.dbPool.query(`
        SELECT ${SELECT_FIELDS}
        FROM users u
        WHERE lower(trim(u.username)) = $1
          AND COALESCE(u.is_active, true) = true
          AND u.deleted_at IS NULL
        LIMIT 1
      `, [normalized]);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async findByUsernameIncludingInactive(username) {
        const normalized = normalizeUsername(username);
        const result = await database_1.dbPool.query(`
        SELECT ${SELECT_FIELDS}
        FROM users u
        WHERE lower(trim(u.username)) = $1
        LIMIT 1
      `, [normalized]);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async findActiveDoctorUserIdByDoctorProfile(doctorId, excludeUserId) {
        const result = await database_1.dbPool.query(`
        SELECT u.id
        FROM users u
        WHERE u.doctor_id = $1
          AND u.role = 'doctor'
          AND u.deleted_at IS NULL
          AND ($2::bigint IS NULL OR u.id <> $2::bigint)
        LIMIT 1
      `, [doctorId, excludeUserId ?? null]);
        if (result.rows.length === 0)
            return null;
        return Number(result.rows[0].id);
    }
    async create(data) {
        const username = normalizeUsername(data.username);
        const doctorId = data.role === "doctor" ? data.doctorId ?? null : null;
        const result = await database_1.dbPool.query(`
        INSERT INTO users (username, password_hash, full_name, role, is_active, doctor_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ${RETURNING_FIELDS}
      `, [username, data.password, data.fullName, data.role, data.isActive ?? true, doctorId]);
        return mapRow(result.rows[0]);
    }
    async update(id, data) {
        const sets = [];
        const values = [];
        let i = 1;
        if (data.fullName !== undefined) {
            sets.push(`full_name = $${i++}`);
            values.push(data.fullName);
        }
        if (data.role !== undefined) {
            sets.push(`role = $${i++}`);
            values.push(data.role);
        }
        if (data.isActive !== undefined) {
            sets.push(`is_active = $${i++}`);
            values.push(data.isActive);
        }
        if (data.doctorId !== undefined) {
            sets.push(`doctor_id = $${i++}`);
            values.push(data.doctorId);
        }
        sets.push(`updated_at = NOW()`);
        if (sets.length === 0) {
            return this.findById(id);
        }
        values.push(id);
        const result = await database_1.dbPool.query(`
        UPDATE users
        SET ${sets.join(", ")}
        WHERE id = $${i} AND deleted_at IS NULL
        RETURNING ${RETURNING_FIELDS}
      `, values);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async delete(id) {
        const result = await database_1.dbPool.query(`
        UPDATE users
        SET deleted_at = NOW(),
            is_active = false,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [id]);
        return result.rows.length > 0;
    }
    async toggleActive(id) {
        const result = await database_1.dbPool.query(`
        UPDATE users
        SET is_active = NOT is_active,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${RETURNING_FIELDS}
      `, [id]);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async updatePassword(id, passwordHash) {
        const result = await database_1.dbPool.query(`
        UPDATE users
        SET password_hash = $2,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${RETURNING_FIELDS}
      `, [id, passwordHash]);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async updateSecurityState(id, patch) {
        const sets = ["updated_at = NOW()"];
        const values = [];
        let i = 1;
        if (patch.lastLoginAt !== undefined) {
            sets.push(`last_login_at = $${i++}`);
            values.push(patch.lastLoginAt);
        }
        if (patch.failedLoginAttempts !== undefined) {
            sets.push(`failed_login_attempts = $${i++}`);
            values.push(patch.failedLoginAttempts);
        }
        if (patch.lockedUntil !== undefined) {
            sets.push(`locked_until = $${i++}`);
            values.push(patch.lockedUntil);
        }
        values.push(id);
        const result = await database_1.dbPool.query(`
        UPDATE users u
        SET ${sets.join(", ")}
        WHERE u.id = $${i} AND u.deleted_at IS NULL
        RETURNING ${RETURNING_FIELDS}
      `, values);
        if (result.rows.length === 0)
            return null;
        return mapRow(result.rows[0]);
    }
}
exports.PostgresUsersRepository = PostgresUsersRepository;
