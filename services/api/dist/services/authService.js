"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const jwt_1 = require("../utils/jwt");
const password_1 = require("../utils/password");
const userSanitizer_1 = require("../utils/userSanitizer");
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const normalizeClientIp = (ip) => ip && ip.trim() ? ip.trim() : null;
const addMinutesIso = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
const mockAuditLogs = [];
class AuthService {
    constructor(usersRepository, nursesRepository) {
        this.usersRepository = usersRepository;
        this.nursesRepository = nursesRepository;
    }
    async logAudit(params) {
        if (env_1.env.dataProvider === "postgres") {
            await database_1.dbPool.query(`
          INSERT INTO login_audit_logs (user_id, username, success, ip, user_agent, reason)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
                params.userId,
                params.username,
                params.success,
                params.ip,
                params.userAgent,
                params.reason,
            ]);
            return;
        }
        mockAuditLogs.push({ ...params, createdAt: new Date().toISOString() });
    }
    async registerFailedAttempt(user) {
        const nextFails = (user.failedLoginAttempts ?? 0) + 1;
        const shouldLock = nextFails >= MAX_FAILED_LOGIN_ATTEMPTS;
        await this.usersRepository.updateSecurityState(user.id, {
            failedLoginAttempts: nextFails,
            ...(shouldLock ? { lockedUntil: addMinutesIso(LOCK_MINUTES) } : {}),
        });
    }
    async resetSecurityOnSuccess(user) {
        await this.usersRepository.updateSecurityState(user.id, {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date().toISOString(),
        });
    }
    async validateCredentials(username, password, meta) {
        const user = await this.usersRepository.findByUsernameIncludingInactive(username);
        // eslint-disable-next-line no-console
        console.log("USER:", user
            ? {
                id: user.id,
                username: user.username,
                isActive: user.isActive,
                hasPasswordField: Boolean(user.password),
                passwordStorage: user.password?.startsWith("$2") ? "bcrypt" : "legacy_plaintext",
            }
            : null);
        if (!user) {
            await this.logAudit({
                userId: null,
                username,
                success: false,
                ip: normalizeClientIp(meta?.ip),
                userAgent: meta?.userAgent ?? null,
                reason: "invalid_username",
            });
            throw new errorHandler_1.ApiError(401, "Invalid credentials");
        }
        if (!user.isActive) {
            await this.logAudit({
                userId: user.id,
                username,
                success: false,
                ip: normalizeClientIp(meta?.ip),
                userAgent: meta?.userAgent ?? null,
                reason: "inactive_user",
            });
            throw new errorHandler_1.ApiError(403, "User is inactive");
        }
        const lockedUntil = user.lockedUntil ? Date.parse(user.lockedUntil) : NaN;
        if (!Number.isNaN(lockedUntil) && lockedUntil > Date.now()) {
            await this.logAudit({
                userId: user.id,
                username,
                success: false,
                ip: normalizeClientIp(meta?.ip),
                userAgent: meta?.userAgent ?? null,
                reason: "account_locked",
            });
            throw new errorHandler_1.ApiError(429, "Too many login attempts. Please try again later.");
        }
        const isMatch = await (0, password_1.verifyPassword)(password, user.password);
        if (!isMatch) {
            await this.registerFailedAttempt(user);
            await this.logAudit({
                userId: user.id,
                username,
                success: false,
                ip: normalizeClientIp(meta?.ip),
                userAgent: meta?.userAgent ?? null,
                reason: "invalid_password",
            });
            throw new errorHandler_1.ApiError(401, "Invalid credentials");
        }
        return user;
    }
    async login(input, meta) {
        const user = await this.validateCredentials(input.username, input.password, meta);
        const response = await this.issueAccessResponse(user);
        await this.resetSecurityOnSuccess(user);
        await this.logAudit({
            userId: user.id,
            username: user.username,
            success: true,
            ip: normalizeClientIp(meta?.ip),
            userAgent: meta?.userAgent ?? null,
            reason: "success",
        });
        return response;
    }
    async buildTokenPayload(user) {
        const base = {
            userId: user.id,
            username: user.username,
            role: user.role,
            doctorId: user.role === "doctor" ? user.doctorId ?? null : null,
        };
        if (user.role === "nurse") {
            const nid = await this.nursesRepository.findDoctorIdByUserId(user.id);
            if (nid == null) {
                throw new errorHandler_1.ApiError(403, "Учётная запись медсестры не привязана к врачу");
            }
            return { ...base, nurseDoctorId: nid };
        }
        return base;
    }
    async issueAccessResponse(user) {
        const payload = await this.buildTokenPayload(user);
        const accessToken = (0, jwt_1.signAccessToken)(payload);
        // eslint-disable-next-line no-console
        console.log("JWT CREATED:", Boolean(accessToken && accessToken.length > 0));
        const publicBase = (0, userSanitizer_1.toPublicUser)(user);
        if (user.role === "nurse") {
            return {
                accessToken,
                user: {
                    ...publicBase,
                    nurseDoctorId: payload.nurseDoctorId ?? null,
                },
            };
        }
        return { accessToken, user: publicBase };
    }
    async getAuditLogs(auth) {
        if (auth.role !== "superadmin") {
            throw new errorHandler_1.ApiError(403, "Only superadmin can view auth audit logs");
        }
        if (env_1.env.dataProvider === "postgres") {
            const result = await database_1.dbPool.query(`
          SELECT user_id, username, success, ip, user_agent, reason, created_at
          FROM login_audit_logs
          ORDER BY created_at DESC
          LIMIT 500
        `);
            return result.rows.map((r) => ({
                userId: r.user_id,
                username: r.username,
                success: r.success,
                ip: r.ip,
                userAgent: r.user_agent,
                reason: r.reason,
                createdAt: r.created_at,
            }));
        }
        return [...mockAuditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    async getMe(auth) {
        const user = await this.usersRepository.findById(auth.userId);
        if (!user) {
            throw new errorHandler_1.ApiError(404, "User not found");
        }
        if (!user.isActive) {
            throw new errorHandler_1.ApiError(403, "User is inactive");
        }
        const base = (0, userSanitizer_1.toPublicUser)(user);
        if (user.role === "nurse") {
            const nid = await this.nursesRepository.findDoctorIdByUserId(user.id);
            return { ...base, nurseDoctorId: nid };
        }
        return base;
    }
}
exports.AuthService = AuthService;
