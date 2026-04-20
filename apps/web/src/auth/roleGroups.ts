import type { UserRole } from "./permissions";
import {
  USER_ROLES,
  canSetAppointmentCommercialPrice,
  hasPermission,
  rolesWithPermission,
} from "./permissions";

export { USER_ROLES, hasPermission, rolesWithPermission };

export const CLINIC_STAFF: UserRole[] = [...USER_ROLES];

/** Пункт «Панель управления» — без медсестры и кассира (узкий рабочий стол / только финансы). */
export const DASHBOARD_NAV_ROLES: UserRole[] = CLINIC_STAFF.filter(
  (r) => r !== "nurse" && r !== "cashier"
);

/** Навигация и роуты биллинга: есть доступ к счетам, платежам или кассе */
export const BILLING_ROLES = USER_ROLES.filter(
  (r) =>
    hasPermission(r, "invoices", "read") ||
    hasPermission(r, "payments", "read") ||
    hasPermission(r, "cash", "read")
);

export const REPORT_ROLES = rolesWithPermission("reports", "read");
export const EXPENSES_READ_ROLES = rolesWithPermission("expenses", "read");

export const PATIENTS_ROLES = rolesWithPermission("patients", "read");

/** Страница «Пациенты» и пункт меню — только операционные роли (read в API у кассира/буха/директора — без списка карточек). */
export const PATIENTS_PAGE_ROUTE_ROLES = PATIENTS_ROLES.filter(
  (r) => r !== "cashier" && r !== "accountant" && r !== "director"
);

/** Роут «Платежи» (только просмотр журнала). */
export const PAYMENTS_READ_PAGE_ROLES = rolesWithPermission("payments", "read");

export const APPOINTMENTS_ROLES = rolesWithPermission("appointments", "read");

/** Раздел «Записи» в меню и SPA-роут — без бухгалтера и директора (read в API для связки со счётом). */
export const APPOINTMENTS_PAGE_ROUTE_ROLES = APPOINTMENTS_ROLES.filter(
  (r) => r !== "accountant" && r !== "director"
);

export const DOCTORS_PAGE_ROLES = rolesWithPermission("doctors", "read");

export const SERVICES_PAGE_ROLES = rolesWithPermission("services", "read");

/** Страницы справочников «Врачи» / «Услуги» — врач видит только себя и свои услуги через API, UI скрыт. */
export const DOCTORS_DIRECTORY_ROLES = DOCTORS_PAGE_ROLES.filter((r) => r !== "doctor");
export const SERVICES_DIRECTORY_ROLES = SERVICES_PAGE_ROLES.filter((r) => r !== "doctor");

export const USERS_PAGE_ROLES = rolesWithPermission("users", "read");

export const SYSTEM_ARCH_ROLES = rolesWithPermission("users", "read");

export const DOCTOR_WORKSPACE_ROLES: UserRole[] = ["superadmin", "manager", "doctor", "nurse"];

export const canReadBilling = (role: UserRole | undefined | null): boolean =>
  !!role &&
  (hasPermission(role, "invoices", "read") ||
    hasPermission(role, "payments", "read") ||
    hasPermission(role, "cash", "read"));

export const canReadAppointments = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "appointments", "read");

export const canWriteAppointments = (role: UserRole | undefined | null): boolean =>
  !!role &&
  (hasPermission(role, "appointments", "create") ||
    hasPermission(role, "appointments", "update") ||
    hasPermission(role, "appointments", "delete"));

export const canCreateAppointments = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "appointments", "create");

export const canUpdateAppointments = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "appointments", "update");

export const canDeleteAppointments = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "appointments", "delete");

export { canSetAppointmentCommercialPrice };

/** Создание записи с выбором пациента из справочника (модалки с автодополнением). */
export const canCreateAppointmentWithPatientPicker = (
  role: UserRole | undefined | null
): boolean => canCreateAppointments(role) && canReadPatients(role);

export const canReadPatients = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "patients", "read");

export const canReadAi = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "ai", "read");

export const canCreatePatients = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "patients", "create");

/**
 * Кнопка «Быстрая запись пациента» на дашборде: только административные и регистратура роли
 * (не врач, не оператор звонков и т.д.).
 */
export const canUseDashboardQuickPatientBooking = (role: UserRole | undefined | null): boolean =>
  role === "superadmin" || role === "manager" || role === "reception";

export const canUpdatePatients = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "patients", "update");

export const canWriteBilling = (role: UserRole | undefined | null): boolean =>
  !!role &&
  (hasPermission(role, "payments", "create") ||
    hasPermission(role, "invoices", "create") ||
    hasPermission(role, "invoices", "update") ||
    hasPermission(role, "cash", "update"));

/** Возврат оплаты (POST /payments/:id/refund). */
export const canRefundPayments = (role: UserRole | undefined | null): boolean =>
  !!role && hasPermission(role, "payments", "update");

/** Клинические поля в истории визитов (согласовано с API redaction). */
export const PATIENT_VISIT_CLINICAL_ROLES: UserRole[] = [
  "superadmin",
  "manager",
  "reception",
  "doctor",
  "nurse",
];

export const canViewPatientVisitClinical = (role: UserRole | undefined | null): boolean =>
  !!role && PATIENT_VISIT_CLINICAL_ROLES.includes(role);
