"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIExecutorService = void 0;
const formatSum = (value) => `${Math.round(value).toLocaleString("ru-RU")} сум`;
class AIExecutorService {
    constructor(deps) {
        this.deps = deps;
    }
    async executeAction(action, auth) {
        if (action.type === "CREATE_PATIENT") {
            await this.deps.patientsService.create(auth, {
                fullName: action.payload.fullName,
                phone: null,
                gender: null,
                birthDate: null,
            });
            return `Пациент ${action.payload.fullName} успешно создан`;
        }
        if (action.type === "CREATE_APPOINTMENT") {
            const created = await this.deps.appointmentsService.create(auth, {
                patientId: action.payload.patientId,
                doctorId: action.payload.doctorId,
                serviceId: action.payload.serviceId,
                startAt: action.payload.startAt,
                endAt: action.payload.startAt,
                status: "scheduled",
                diagnosis: null,
                treatment: null,
                notes: null,
            });
            const time = created.startAt.slice(11, 16);
            return `✔ Запись создана на ${time}`;
        }
        if (action.type === "CREATE_INVOICE") {
            await this.deps.invoicesService.create(auth, {
                patientId: action.payload.patientId,
                appointmentId: action.payload.appointmentId,
                status: "issued",
                items: [{ serviceId: action.payload.serviceId, quantity: 1 }],
            });
            return "✔ Счет создан";
        }
        if (action.type === "CREATE_PAYMENT") {
            const payment = await this.deps.paymentsService.create(auth, {
                invoiceId: action.payload.invoiceId,
                amount: action.payload.amount,
                method: action.payload.method,
            });
            return `✔ Оплата проведена: ${formatSum(payment.amount)}`;
        }
        await this.deps.cashRegisterService.closeShift(auth, action.payload.shiftId, {
            closedBy: auth.userId,
            notes: "Closed by AI action",
        });
        return "✔ Смена закрыта";
    }
}
exports.AIExecutorService = AIExecutorService;
