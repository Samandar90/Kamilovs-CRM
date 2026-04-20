"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPOINTMENT_COMMERCIAL_PRICE_ROLES = exports.FINANCIAL_PORTAL_ROLES = exports.PERMISSIONS = exports.PERMISSION_ACTIONS = exports.PERMISSION_MODULES = exports.USER_ROLES = void 0;
exports.hasPermission = hasPermission;
exports.rolesWithPermission = rolesWithPermission;
exports.roleHasPermissionKey = roleHasPermissionKey;
exports.canSetAppointmentCommercialPrice = canSetAppointmentCommercialPrice;
exports.USER_ROLES = [
    "superadmin",
    "reception",
    "doctor",
    "nurse",
    "cashier",
    "operator",
    "accountant",
    "manager",
    "director",
];
exports.PERMISSION_MODULES = [
    "patients",
    "doctors",
    "services",
    "appointments",
    "invoices",
    "payments",
    "expenses",
    "cash",
    "reports",
    "users",
    "ai",
];
exports.PERMISSION_ACTIONS = ["read", "create", "update", "delete"];
/**
 * Матрица RBAC (source of truth для API).
 * superadmin обрабатывается отдельно — полный доступ.
 */
const ROLE_PERMISSIONS = {
    superadmin: {},
    reception: {
        patients: ["read", "create", "update"],
        doctors: ["read"],
        services: ["read"],
        appointments: ["read", "create", "update", "delete"],
        ai: ["read", "create"],
    },
    doctor: {
        patients: ["read"],
        doctors: ["read"],
        services: ["read"],
        appointments: ["read", "update"],
        ai: ["read", "create"],
    },
    nurse: {
        patients: ["read"],
        appointments: ["read", "update"],
        ai: ["read", "create"],
    },
    cashier: {
        patients: ["read"],
        appointments: ["read"],
        invoices: ["read", "update"],
        payments: ["read", "create"],
        expenses: ["read", "create", "update", "delete"],
        cash: ["read", "update"],
        ai: ["read", "create"],
    },
    /** Оператор колл-центра: расписание без доступа к карточкам пациентов и без создания записей. */
    operator: {
        appointments: ["read", "update"],
        ai: ["read", "create"],
    },
    accountant: {
        patients: ["read"],
        appointments: ["read"],
        invoices: ["read"],
        payments: ["read"],
        expenses: ["read", "create", "update", "delete"],
        cash: ["read"],
        reports: ["read"],
        ai: ["read", "create"],
    },
    /** Операционное руководство: пациенты/записи + просмотр финансов и отчётов; без биллинга и users (как у superadmin). */
    manager: {
        patients: ["read", "create", "update"],
        doctors: ["read"],
        services: ["read"],
        appointments: ["read", "create", "update", "delete"],
        invoices: ["read"],
        payments: ["read"],
        expenses: ["read", "create", "update", "delete"],
        cash: ["read"],
        reports: ["read"],
        ai: ["read", "create"],
    },
    /** Наблюдатель: финансы, отчёты, read пациент/запись только для контекста счёта (без UI операционки). */
    director: {
        patients: ["read"],
        appointments: ["read"],
        invoices: ["read"],
        payments: ["read"],
        expenses: ["read"],
        cash: ["read"],
        reports: ["read"],
        ai: ["read", "create"],
    },
};
function hasPermission(role, module, action) {
    if (role === "superadmin") {
        return true;
    }
    const allowed = ROLE_PERMISSIONS[role]?.[module];
    return Boolean(allowed?.includes(action));
}
function rolesWithPermission(module, action) {
    return exports.USER_ROLES.filter((r) => hasPermission(r, module, action));
}
const uniqRoles = (roles) => [...new Set(roles)];
const roleList = (module, action) => rolesWithPermission(module, action);
/**
 * Именованные возможности (SaaS-style). Списки ролей выводятся из матрицы `ROLE_PERMISSIONS` — один источник правды.
 * Исключения: `APPOINTMENT_COMMERCIAL_PRICE`, `FINANCIAL_PORTAL_ACCESS`, `DEV_ADMIN_BOOTSTRAP` (узкие политики).
 */
exports.PERMISSIONS = {
    PATIENT_READ: roleList("patients", "read"),
    PATIENT_CREATE: roleList("patients", "create"),
    PATIENT_UPDATE: roleList("patients", "update"),
    PATIENT_DELETE: roleList("patients", "delete"),
    DOCTORS_READ: roleList("doctors", "read"),
    SERVICES_READ: roleList("services", "read"),
    APPOINTMENT_READ: roleList("appointments", "read"),
    APPOINTMENT_CREATE: roleList("appointments", "create"),
    APPOINTMENT_UPDATE: roleList("appointments", "update"),
    APPOINTMENT_DELETE: roleList("appointments", "delete"),
    /** PATCH /appointments/:id/price — не выводится из module/action матрицы. */
    APPOINTMENT_COMMERCIAL_PRICE: ["superadmin", "reception", "manager"],
    INVOICE_READ: roleList("invoices", "read"),
    PAYMENT_READ: roleList("payments", "read"),
    CASH_READ: roleList("cash", "read"),
    REPORT_READ: roleList("reports", "read"),
    EXPENSE_READ: roleList("expenses", "read"),
    USERS_READ: roleList("users", "read"),
    USERS_CREATE: roleList("users", "create"),
    USERS_UPDATE: roleList("users", "update"),
    USERS_DELETE: roleList("users", "delete"),
    AI_READ: roleList("ai", "read"),
    AI_CREATE: roleList("ai", "create"),
    /** Любой доступ к порталу счетов/оплат/кассы/отчётов (маршруты под `requireFinancialPortalAccess`). */
    FINANCIAL_PORTAL_ACCESS: uniqRoles([
        ...rolesWithPermission("invoices", "read"),
        ...rolesWithPermission("payments", "read"),
        ...rolesWithPermission("cash", "read"),
        ...rolesWithPermission("reports", "read"),
    ]),
    /** POST /api/dev/create-admin (только не-production + auth). */
    DEV_ADMIN_BOOTSTRAP: ["superadmin"],
};
function roleHasPermissionKey(role, key) {
    const allowed = exports.PERMISSIONS[key];
    return allowed.includes(role);
}
/** @deprecated Используйте `PERMISSIONS.FINANCIAL_PORTAL_ACCESS` или `roleHasPermissionKey(..., 'FINANCIAL_PORTAL_ACCESS')`. */
exports.FINANCIAL_PORTAL_ROLES = exports.PERMISSIONS.FINANCIAL_PORTAL_ACCESS;
/** @deprecated Используйте `PERMISSIONS.APPOINTMENT_COMMERCIAL_PRICE`. */
exports.APPOINTMENT_COMMERCIAL_PRICE_ROLES = exports.PERMISSIONS.APPOINTMENT_COMMERCIAL_PRICE;
function canSetAppointmentCommercialPrice(role) {
    return roleHasPermissionKey(role, "APPOINTMENT_COMMERCIAL_PRICE");
}
