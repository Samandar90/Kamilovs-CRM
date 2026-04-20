"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLoginBody = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const validateLoginBody = (req, _res, next) => {
    const { username, password } = req.body ?? {};
    if (!username || typeof username !== "string" || username.trim() === "") {
        throw new errorHandler_1.ApiError(400, "Field 'username' is required");
    }
    if (!password || typeof password !== "string" || password.trim() === "") {
        throw new errorHandler_1.ApiError(400, "Field 'password' is required");
    }
    next();
};
exports.validateLoginBody = validateLoginBody;
