"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminDevController = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const mockDatabase_1 = require("../repositories/mockDatabase");
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const ADMIN_FULL_NAME = "Administrator";
const ADMIN_ROLE = "superadmin";
const createAdminDevController = async (_req, res) => {
    const passwordHash = await bcrypt_1.default.hash(ADMIN_PASSWORD, 10);
    if (env_1.env.dataProvider === "postgres") {
        const existing = await database_1.dbPool.query(`
        SELECT id
        FROM users
        WHERE lower(trim(username)) = lower(trim($1))
          AND deleted_at IS NULL
        LIMIT 1
      `, [ADMIN_USERNAME]);
        if (existing.rowCount && existing.rows[0]) {
            await database_1.dbPool.query(`
          UPDATE users
          SET
            password_hash = $2,
            full_name = $3,
            role = $4,
            is_active = TRUE,
            updated_at = now()
          WHERE id = $1
        `, [existing.rows[0].id, passwordHash, ADMIN_FULL_NAME, ADMIN_ROLE]);
        }
        else {
            await database_1.dbPool.query(`
          INSERT INTO users (username, password_hash, full_name, role, is_active, doctor_id)
          VALUES ($1, $2, $3, $4, TRUE, NULL)
        `, [ADMIN_USERNAME, passwordHash, ADMIN_FULL_NAME, ADMIN_ROLE]);
        }
    }
    else {
        const db = (0, mockDatabase_1.getMockDb)();
        const existing = db.users.find((user) => user.deletedAt == null && user.username.trim().toLowerCase() === ADMIN_USERNAME);
        if (existing) {
            existing.password = passwordHash;
            existing.fullName = ADMIN_FULL_NAME;
            existing.role = ADMIN_ROLE;
            existing.isActive = true;
            existing.updatedAt = new Date().toISOString();
        }
        else {
            const now = new Date().toISOString();
            db.users.push({
                id: (0, mockDatabase_1.nextId)(),
                username: ADMIN_USERNAME,
                password: passwordHash,
                fullName: ADMIN_FULL_NAME,
                role: ADMIN_ROLE,
                isActive: true,
                doctorId: null,
                lastLoginAt: null,
                failedLoginAttempts: 0,
                lockedUntil: null,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            });
        }
    }
    return res.status(200).json({ success: true });
};
exports.createAdminDevController = createAdminDevController;
