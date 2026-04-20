"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockInvoicesRepository = exports.INVOICE_STATUSES = void 0;
const billingTypes_1 = require("./interfaces/billingTypes");
Object.defineProperty(exports, "INVOICE_STATUSES", { enumerable: true, get: function () { return billingTypes_1.INVOICE_STATUSES; } });
const mockDatabase_1 = require("./mockDatabase");
const toSummary = (row) => ({
    id: row.id,
    number: row.number,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    status: row.status,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    paidAmount: row.paidAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});
class MockInvoicesRepository {
    async findAll(filters = {}) {
        return (0, mockDatabase_1.getMockDb)()
            .invoices.filter((row) => {
            if (row.deletedAt)
                return false;
            if (filters.patientId !== undefined && row.patientId !== filters.patientId)
                return false;
            if (filters.appointmentId !== undefined &&
                row.appointmentId !== filters.appointmentId) {
                return false;
            }
            if (filters.status !== undefined && row.status !== filters.status)
                return false;
            return true;
        })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((row) => toSummary(row));
    }
    async findById(id) {
        const invoice = (0, mockDatabase_1.getMockDb)().invoices.find((row) => row.id === id && !row.deletedAt);
        if (!invoice)
            return null;
        const items = (0, mockDatabase_1.getMockDb)()
            .invoiceItems.filter((row) => row.invoiceId === id)
            .map((row) => ({ ...row }));
        return { ...toSummary(invoice), items };
    }
    async create(input, items) {
        const now = new Date().toISOString();
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            number: input.number,
            patientId: input.patientId,
            appointmentId: input.appointmentId ?? null,
            status: input.status,
            subtotal: input.subtotal,
            discount: input.discount,
            total: input.total,
            paidAmount: input.paidAmount,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };
        (0, mockDatabase_1.getMockDb)().invoices.push(created);
        await this.replaceItems(created.id, items);
        return toSummary(created);
    }
    async update(id, input, replaceLineItems) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.invoices.findIndex((row) => row.id === id && !row.deletedAt);
        if (idx < 0)
            return null;
        db.invoices[idx] = {
            ...db.invoices[idx],
            ...input,
            appointmentId: input.appointmentId !== undefined ? input.appointmentId ?? null : db.invoices[idx].appointmentId,
            updatedAt: new Date().toISOString(),
        };
        if (replaceLineItems !== undefined) {
            await this.replaceItems(id, replaceLineItems);
        }
        return toSummary(db.invoices[idx]);
    }
    async delete(id) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.invoices.findIndex((row) => row.id === id && !row.deletedAt);
        if (idx < 0)
            return false;
        db.invoices[idx] = {
            ...db.invoices[idx],
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        return true;
    }
    async replaceItems(invoiceId, items) {
        const db = (0, mockDatabase_1.getMockDb)();
        db.invoiceItems = db.invoiceItems.filter((row) => row.invoiceId !== invoiceId);
        for (const item of items) {
            db.invoiceItems.push({
                id: (0, mockDatabase_1.nextId)(),
                invoiceId,
                serviceId: item.serviceId ?? null,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
            });
        }
    }
    async patientExists(id) {
        return (0, mockDatabase_1.getMockDb)().patients.some((row) => row.id === id && row.deletedAt === null);
    }
    async appointmentExists(id) {
        return (0, mockDatabase_1.getMockDb)().appointments.some((row) => row.id === id);
    }
    async getAppointmentPatientId(appointmentId) {
        const found = (0, mockDatabase_1.getMockDb)().appointments.find((row) => row.id === appointmentId);
        return found ? found.patientId : null;
    }
}
exports.MockInvoicesRepository = MockInvoicesRepository;
