"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAccessToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const EXPIRES_IN = "8h";
const signAccessToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, { expiresIn: EXPIRES_IN });
};
exports.signAccessToken = signAccessToken;
const verifyAccessToken = (token) => {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    if (!decoded || typeof decoded !== "object") {
        throw new Error("Invalid token payload");
    }
    const payload = decoded;
    if (typeof payload.userId !== "number" ||
        typeof payload.username !== "string" ||
        typeof payload.role !== "string") {
        throw new Error("Token payload shape is invalid");
    }
    if (payload.doctorId !== undefined &&
        payload.doctorId !== null &&
        typeof payload.doctorId !== "number") {
        throw new Error("Invalid token payload");
    }
    if (payload.nurseDoctorId !== undefined &&
        payload.nurseDoctorId !== null &&
        typeof payload.nurseDoctorId !== "number") {
        throw new Error("Invalid token payload");
    }
    const doctorId = payload.doctorId;
    const nurseDoctorId = payload.nurseDoctorId;
    return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        ...(doctorId !== undefined ? { doctorId } : {}),
        ...(nurseDoctorId !== undefined ? { nurseDoctorId } : {}),
    };
};
exports.verifyAccessToken = verifyAccessToken;
