"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAnyRole = exports.ROLE_GROUPS = void 0;
exports.ROLE_GROUPS = {
    ALL_INTERNAL: [
        "admin",
        "manager",
        "doctor",
        "cashier",
        "operator",
        "nurse",
        "lab",
        "accountant",
        "director",
    ],
    PATIENTS_READ: [
        "admin",
        "manager",
        "doctor",
        "nurse",
        "operator",
        "director",
        "cashier",
        "lab",
        "accountant",
    ],
    PATIENTS_WRITE: ["admin", "manager", "operator"],
    DOCTORS_READ: [
        "admin",
        "manager",
        "doctor",
        "nurse",
        "operator",
        "cashier",
        "accountant",
        "director",
        "lab",
    ],
    ADMIN_ONLY: ["admin"],
    APPOINTMENTS_READ: ["admin", "manager", "doctor", "nurse", "operator", "director", "lab"],
    APPOINTMENTS_WRITE: ["admin", "manager", "operator", "doctor"],
    APPOINTMENTS_DELETE: ["admin", "manager"],
    BILLING_READ: ["admin", "manager", "cashier", "accountant", "director"],
    BILLING_WRITE: ["admin", "manager", "cashier", "accountant"],
    BILLING_DELETE: ["admin", "accountant"],
    REPORTS_READ: ["admin", "manager", "accountant", "director"],
};
const hasAnyRole = (role, allowedRoles) => {
    return allowedRoles.includes(role);
};
exports.hasAnyRole = hasAnyRole;
