"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.hashPasswordSync = exports.hashPassword = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const DEFAULT_SALT_ROUNDS = 10;
const hashPassword = async (plainTextPassword, saltRounds = DEFAULT_SALT_ROUNDS) => {
    return bcrypt_1.default.hash(plainTextPassword, saltRounds);
};
exports.hashPassword = hashPassword;
const hashPasswordSync = (plainTextPassword, saltRounds = DEFAULT_SALT_ROUNDS) => {
    return bcrypt_1.default.hashSync(plainTextPassword, saltRounds);
};
exports.hashPasswordSync = hashPasswordSync;
const verifyPassword = async (plainTextPassword, persistedPassword) => {
    if (!persistedPassword) {
        return false;
    }
    return bcrypt_1.default.compare(plainTextPassword, persistedPassword);
};
exports.verifyPassword = verifyPassword;
