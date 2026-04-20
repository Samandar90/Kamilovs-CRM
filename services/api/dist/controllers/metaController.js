"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clinicMetaController = void 0;
const env_1 = require("../config/env");
/** Публичные подписи для чеков и UI (не секреты). */
const clinicMetaController = async (_req, res) => {
    res.status(200).json({
        clinicName: env_1.env.clinicDisplayName,
        receiptFooter: env_1.env.clinicReceiptFooter,
        reportsTimezone: env_1.env.reportsTimezone,
    });
};
exports.clinicMetaController = clinicMetaController;
