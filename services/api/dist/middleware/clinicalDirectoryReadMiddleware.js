"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowServicesReadOrClinicalAssistant = exports.allowDoctorsReadOrClinicalAssistant = void 0;
const permissions_1 = require("../auth/permissions");
const errorHandler_1 = require("./errorHandler");
/**
 * Чтение справочников для врача/медсестры/оператора записи без глобального `doctors`/`services` в матрице:
 * для врача/медсестры список режется в сервисе по `doctorId` / `nurseDoctorId`; оператор получает полный список для формы записи.
 */
const allowDoctorsReadOrClinicalAssistant = (req, _res, next) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    const { role } = req.auth;
    if ((0, permissions_1.hasPermission)(role, "doctors", "read")) {
        next();
        return;
    }
    if (role === "doctor" || role === "nurse" || role === "operator") {
        next();
        return;
    }
    throw new errorHandler_1.ApiError(403, "Недостаточно прав для просмотра врачей");
};
exports.allowDoctorsReadOrClinicalAssistant = allowDoctorsReadOrClinicalAssistant;
const allowServicesReadOrClinicalAssistant = (req, _res, next) => {
    if (!req.auth) {
        throw new errorHandler_1.ApiError(401, "Unauthorized");
    }
    const { role } = req.auth;
    if ((0, permissions_1.hasPermission)(role, "services", "read")) {
        next();
        return;
    }
    if (role === "doctor" || role === "nurse" || role === "operator") {
        next();
        return;
    }
    throw new errorHandler_1.ApiError(403, "Недостаточно прав для просмотра услуг");
};
exports.allowServicesReadOrClinicalAssistant = allowServicesReadOrClinicalAssistant;
