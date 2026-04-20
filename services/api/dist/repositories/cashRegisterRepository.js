"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockCashRegisterRepository = exports.CASH_ENTRY_TYPES = exports.CASH_ENTRY_METHODS = void 0;
const billingTypes_1 = require("./interfaces/billingTypes");
Object.defineProperty(exports, "CASH_ENTRY_METHODS", { enumerable: true, get: function () { return billingTypes_1.CASH_ENTRY_METHODS; } });
Object.defineProperty(exports, "CASH_ENTRY_TYPES", { enumerable: true, get: function () { return billingTypes_1.CASH_ENTRY_TYPES; } });
const mockDatabase_1 = require("./mockDatabase");
class MockCashRegisterRepository {
    async findActiveShift() {
        const found = [...(0, mockDatabase_1.getMockDb)().cashRegisterShifts]
            .filter((row) => row.closedAt === null)
            .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
        return found ? { ...found } : null;
    }
    async openShift(input) {
        const now = new Date().toISOString();
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            openedBy: input.openedBy ?? null,
            closedBy: null,
            openedAt: now,
            closedAt: null,
            openingBalance: input.openingBalance,
            closingBalance: null,
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
        };
        (0, mockDatabase_1.getMockDb)().cashRegisterShifts.push(created);
        return { ...created };
    }
    async findShiftById(id) {
        const found = (0, mockDatabase_1.getMockDb)().cashRegisterShifts.find((row) => row.id === id);
        return found ? { ...found } : null;
    }
    async closeShift(id, input) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.cashRegisterShifts.findIndex((row) => row.id === id && row.closedAt === null);
        if (idx < 0)
            return null;
        db.cashRegisterShifts[idx] = {
            ...db.cashRegisterShifts[idx],
            closedAt: new Date().toISOString(),
            closingBalance: input.closingBalance,
            closedBy: input.closedBy ?? db.cashRegisterShifts[idx].closedBy,
            notes: input.notes ?? db.cashRegisterShifts[idx].notes,
            updatedAt: new Date().toISOString(),
        };
        return { ...db.cashRegisterShifts[idx] };
    }
    async findShiftHistory() {
        return [...(0, mockDatabase_1.getMockDb)().cashRegisterShifts]
            .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
            .map((row) => ({ ...row }));
    }
    async findEntries(filters = {}) {
        const dayKey = (iso) => iso.slice(0, 10);
        return (0, mockDatabase_1.getMockDb)()
            .cashRegisterEntries.filter((row) => {
            if (filters.shiftId !== undefined && row.shiftId !== filters.shiftId)
                return false;
            if (filters.method !== undefined &&
                (0, billingTypes_1.normalizePaymentMethod)(String(row.method)) !== filters.method) {
                return false;
            }
            if (filters.type !== undefined && row.type !== filters.type)
                return false;
            if (filters.dateFrom !== undefined && dayKey(row.createdAt) < filters.dateFrom) {
                return false;
            }
            if (filters.dateTo !== undefined && dayKey(row.createdAt) > filters.dateTo) {
                return false;
            }
            return true;
        })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((row) => ({
            ...row,
            method: (0, billingTypes_1.normalizePaymentMethod)(String(row.method)),
        }));
    }
    async findEntriesWithContext(filters = {}) {
        const base = await this.findEntries(filters);
        const db = (0, mockDatabase_1.getMockDb)();
        return base.map((e) => {
            let invoiceId = null;
            let patientId = null;
            let payRow;
            if (e.paymentId != null) {
                payRow = db.payments.find((p) => p.id === e.paymentId);
                if (payRow) {
                    const invId = payRow.invoiceId;
                    invoiceId = invId;
                    const inv = db.invoices.find((i) => i.id === invId);
                    patientId = inv?.patientId ?? null;
                }
            }
            const refAmt = payRow?.refundedAmount ?? 0;
            const payAmt = payRow?.amount ?? 0;
            const remaining = e.type === "payment" && payRow != null
                ? Math.round((Math.max(0, payAmt - refAmt) + Number.EPSILON) * 100) / 100
                : undefined;
            const isPaymentRefunded = e.type === "payment" &&
                payRow != null &&
                (payRow.deletedAt != null || refAmt + 1e-6 >= payAmt);
            return { ...e, invoiceId, patientId, isPaymentRefunded, paymentRemainingRefundable: remaining };
        });
    }
    async createCashRegisterEntry(input) {
        const created = {
            id: (0, mockDatabase_1.nextId)(),
            shiftId: input.shiftId,
            paymentId: input.paymentId ?? null,
            type: input.type,
            amount: input.amount,
            method: input.method,
            note: input.note ?? null,
            createdAt: new Date().toISOString(),
        };
        (0, mockDatabase_1.getMockDb)().cashRegisterEntries.push(created);
        return { ...created };
    }
}
exports.MockCashRegisterRepository = MockCashRegisterRepository;
