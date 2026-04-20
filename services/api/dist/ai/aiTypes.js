"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryFactsFromSnapshot = exports.createEmptyClinicFactsSnapshot = void 0;
/** Безопасный снимок при ошибке SQL/фактов — без падения 500. */
const createEmptyClinicFactsSnapshot = () => ({
    revenueToday: 0,
    revenue7d: 0,
    revenueTotal: 0,
    unpaidCount: 0,
    unpaidTotal: 0,
    avgCheckToday: 0,
    avgCheck7d: 0,
    paymentsCountToday: 0,
    paymentsCount7d: 0,
    topDoctorName: null,
    topDoctorTotal: 0,
    topServiceName: null,
    topServiceTotal: 0,
    doctorsCount: 0,
    servicesCount: 0,
    appointmentsCount: 0,
    appointmentsToday: 0,
    appointmentsCompletedToday: 0,
    appointmentsScheduledToday: 0,
    noShowOrCancelled30d: 0,
    avgDailyRevenue7Days: 0,
    cashShiftOpen: false,
});
exports.createEmptyClinicFactsSnapshot = createEmptyClinicFactsSnapshot;
const summaryFactsFromSnapshot = (f) => ({
    revenueToday: f.revenueToday,
    revenue7d: f.revenue7d,
    revenueTotal: f.revenueTotal,
    paymentsCountToday: f.paymentsCountToday,
    paymentsCount7d: f.paymentsCount7d,
    unpaidCount: f.unpaidCount,
    unpaidTotal: f.unpaidTotal,
    avgCheckToday: f.avgCheckToday,
    avgCheck7d: f.avgCheck7d,
    appointmentsToday: f.appointmentsToday,
    appointmentsCompletedToday: f.appointmentsCompletedToday,
    appointmentsScheduledToday: f.appointmentsScheduledToday,
    noShowOrCancelled30d: f.noShowOrCancelled30d,
    avgDailyRevenue7Days: f.avgDailyRevenue7Days,
    cashShiftOpen: f.cashShiftOpen,
    topDoctorName: f.topDoctorName,
    topDoctorTotal: f.topDoctorTotal,
    topServiceName: f.topServiceName,
    topServiceTotal: f.topServiceTotal,
    doctorsCount: f.doctorsCount,
    servicesCount: f.servicesCount,
    appointmentsCount: f.appointmentsCount,
});
exports.summaryFactsFromSnapshot = summaryFactsFromSnapshot;
