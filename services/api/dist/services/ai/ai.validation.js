"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIValidationService = void 0;
const normalize = (raw) => raw.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
/** Собрать локальное время `YYYY-MM-DD HH:mm:ss`; `time` — HH:mm или HH:mm:ss. */
const toStartAt = (date, time) => {
    const t = time.trim();
    const normalizedTime = t.length === 5 ? `${t}:00` : t;
    return `${date} ${normalizedTime}`;
};
const pickSingleByName = (items, query, nameOf) => {
    if (!query)
        return null;
    const q = normalize(query);
    const exact = items.filter((x) => normalize(nameOf(x)) === q);
    if (exact.length === 1)
        return exact[0];
    const partial = items.filter((x) => normalize(nameOf(x)).includes(q));
    if (partial.length === 1)
        return partial[0];
    return null;
};
class AIValidationService {
    constructor(deps) {
        this.deps = deps;
    }
    async validateAction(action, auth) {
        if (action.type === "CREATE_PATIENT") {
            const fullName = action.payload.patientName?.trim();
            if (!fullName || fullName.length < 3) {
                return { ok: false, message: "Уточните ФИО пациента" };
            }
            return { ok: true, action: { type: "CREATE_PATIENT", payload: { fullName } } };
        }
        if (action.type === "CREATE_APPOINTMENT") {
            if (!action.payload.doctorName)
                return { ok: false, message: "Какой врач?" };
            if (!action.payload.date)
                return { ok: false, message: "Уточните дату" };
            const time = action.payload.time?.trim() || "10:00";
            let patient = null;
            const nameQuery = action.payload.patientName?.trim();
            if (nameQuery) {
                const patients = await this.deps.patientsService.list(auth, { search: nameQuery });
                patient = pickSingleByName(patients, nameQuery, (x) => x.fullName);
                if (!patient)
                    return { ok: false, message: "Не найден пациент" };
            }
            else {
                const all = await this.deps.patientsService.list(auth);
                if (all.length === 1) {
                    patient = { id: all[0].id, fullName: all[0].fullName };
                }
                else {
                    return {
                        ok: false,
                        message: "Укажите пациента в запросе (например: «для Иванова И.И.» или «пациент Сидоров»).",
                    };
                }
            }
            const doctors = await this.deps.doctorsService.list(auth);
            const doctor = pickSingleByName(doctors, action.payload.doctorName, (x) => x.name);
            if (!doctor)
                return { ok: false, message: "Не найден врач" };
            const doctorServices = await this.deps.servicesService.list(auth, { doctorId: doctor.id });
            if (doctorServices.length === 0)
                return { ok: false, message: "У врача нет доступных услуг для записи" };
            const service = action.payload.serviceName
                ? pickSingleByName(doctorServices, action.payload.serviceName, (x) => x.name)
                : doctorServices[0];
            if (!service)
                return { ok: false, message: "Не найдена услуга для записи" };
            const startAt = toStartAt(action.payload.date, time);
            const conflicts = await this.deps.appointmentsService.list(auth, {
                doctorId: doctor.id,
                startFrom: startAt,
                startTo: startAt,
            });
            const hasConflict = conflicts.some((a) => a.startAt === startAt && ["scheduled", "confirmed", "arrived", "in_consultation"].includes(a.status));
            if (hasConflict)
                return { ok: false, message: "У врача уже есть запись на это время" };
            return {
                ok: true,
                action: { type: "CREATE_APPOINTMENT", payload: { patientId: patient.id, doctorId: doctor.id, serviceId: service.id, startAt } },
            };
        }
        if (action.type === "CREATE_INVOICE") {
            if (!action.payload.patientName)
                return { ok: false, message: "Не найден пациент" };
            const patients = await this.deps.patientsService.list(auth, { search: action.payload.patientName });
            const patient = pickSingleByName(patients, action.payload.patientName, (x) => x.fullName);
            if (!patient)
                return { ok: false, message: "Не найден пациент" };
            const appointments = await this.deps.appointmentsService.list(auth, { patientId: patient.id });
            const candidate = appointments
                .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
                .sort((a, b) => (a.startAt < b.startAt ? 1 : -1))[0];
            if (!candidate)
                return { ok: false, message: "Нет подходящей записи для создания счета" };
            let serviceId = candidate.serviceId;
            if (action.payload.serviceName) {
                const serviceList = await this.deps.servicesService.list(auth);
                const svc = pickSingleByName(serviceList, action.payload.serviceName, (x) => x.name);
                if (!svc)
                    return { ok: false, message: "Не найдена услуга" };
                serviceId = svc.id;
            }
            return { ok: true, action: { type: "CREATE_INVOICE", payload: { patientId: patient.id, appointmentId: candidate.id, serviceId } } };
        }
        if (action.type === "CREATE_PAYMENT") {
            if (!action.payload.amount || action.payload.amount <= 0)
                return { ok: false, message: "Уточните сумму оплаты" };
            const rawMethod = action.payload.paymentMethod ?? "cash";
            const method = rawMethod === "cash" ? "cash" : "card";
            const activeShift = await this.deps.cashRegisterService.getActiveShift(auth);
            if (!activeShift)
                return { ok: false, message: "Сначала откройте кассовую смену" };
            if (action.payload.amount >= 1000000 && !action.payload.confirmed) {
                return { ok: false, message: "Подтвердите крупную оплату словом «подтверждаю»" };
            }
            const invoices = await this.deps.invoicesService.list(auth);
            const payable = invoices.filter((i) => ["issued", "partially_paid"].includes(i.status) && i.total - i.paidAmount > 0);
            if (payable.length === 0)
                return { ok: false, message: "Нет счетов для оплаты" };
            let target = payable[0];
            if (action.payload.invoiceRef) {
                const q = normalize(action.payload.invoiceRef);
                const byNumber = payable.find((i) => normalize(i.number).includes(q) || String(i.id) === q);
                if (!byNumber)
                    return { ok: false, message: "Счет не найден" };
                target = byNumber;
            }
            return {
                ok: true,
                action: {
                    type: "CREATE_PAYMENT",
                    payload: { invoiceId: target.id, amount: action.payload.amount, method },
                },
            };
        }
        if (action.type === "CLOSE_SHIFT") {
            const activeShift = await this.deps.cashRegisterService.getActiveShift(auth);
            if (!activeShift)
                return { ok: false, message: "Активная смена не найдена" };
            if (!action.payload.confirmed)
                return { ok: false, message: "Подтвердите закрытие смены словом «подтверждаю»" };
            return { ok: true, action: { type: "CLOSE_SHIFT", payload: { shiftId: activeShift.id } } };
        }
        return { ok: false, message: "Недостаточно данных" };
    }
}
exports.AIValidationService = AIValidationService;
