"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPaymentsRepository = void 0;
const billingTypes_1 = require("../interfaces/billingTypes");
const database_1 = require("../../config/database");
const errorHandler_1 = require("../../middleware/errorHandler");
const numbers_1 = require("../../utils/numbers");
const toIso = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    return new Date(value).toISOString();
};
const num = (v) => (0, numbers_1.parseMoneyColumn)(v, 0);
const mapPayment = (row) => ({
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    amount: num(row.amount),
    refundedAmount: num(row.refunded_amount ?? 0),
    method: (0, billingTypes_1.normalizePaymentMethod)(String(row.method)),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at ?? row.created_at),
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    voidReason: row.void_reason,
});
const PAID_SUM_EXPR = `
  COALESCE(SUM(
    CASE
      WHEN p.deleted_at IS NULL THEN GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))
      ELSE 0::numeric
    END
  ), 0)::numeric`;
class PostgresPaymentsRepository {
    async findAll(filters = {}) {
        const clauses = ["deleted_at IS NULL"];
        const values = [];
        if (filters.invoiceId !== undefined) {
            values.push(filters.invoiceId);
            clauses.push(`invoice_id = $${values.length}`);
        }
        if (filters.method !== undefined) {
            values.push(filters.method);
            clauses.push(`(CASE WHEN method = 'cash' THEN 'cash' ELSE 'card' END) = $${values.length}`);
        }
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          invoice_id,
          amount,
          COALESCE(refunded_amount, 0) AS refunded_amount,
          method,
          created_at,
          updated_at,
          deleted_at,
          void_reason
        FROM payments
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
      `, values);
        return result.rows.map(mapPayment);
    }
    async findById(id) {
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          invoice_id,
          amount,
          COALESCE(refunded_amount, 0) AS refunded_amount,
          method,
          created_at,
          updated_at,
          deleted_at,
          void_reason
        FROM payments
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapPayment(result.rows[0]);
    }
    async findByIdIncludingVoided(id) {
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          invoice_id,
          amount,
          COALESCE(refunded_amount, 0) AS refunded_amount,
          method,
          created_at,
          updated_at,
          deleted_at,
          void_reason
        FROM payments
        WHERE id = $1
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapPayment(result.rows[0]);
    }
    async findActivePaymentByIdempotencyKey(userId, key) {
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          invoice_id,
          amount,
          COALESCE(refunded_amount, 0) AS refunded_amount,
          method,
          created_at,
          updated_at,
          deleted_at,
          void_reason
        FROM payments
        WHERE created_by = $1
          AND idempotency_key = $2
          AND idempotency_key_client_supplied = true
          AND deleted_at IS NULL
        LIMIT 1
      `, [userId, key]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapPayment(result.rows[0]);
    }
    async create(input) {
        const result = await database_1.dbPool.query(`
        INSERT INTO payments (
          invoice_id,
          amount,
          method,
          idempotency_key,
          idempotency_key_client_supplied,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          invoice_id,
          amount,
          COALESCE(refunded_amount, 0) AS refunded_amount,
          method,
          created_at,
          updated_at,
          deleted_at,
          void_reason
      `, [
            input.invoiceId,
            input.amount,
            input.method,
            input.idempotencyKey,
            input.idempotencyKeyClientSupplied,
            input.createdByUserId,
        ]);
        return mapPayment(result.rows[0]);
    }
    async createPaymentAndUpdateInvoice(input, nextInvoiceStatus) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            if (input.idempotencyKeyClientSupplied) {
                await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [
                    `payment_idem:${input.createdByUserId}:${input.idempotencyKey}`,
                ]);
                const existingRes = await client.query(`
            SELECT
              id,
              invoice_id,
              amount,
              COALESCE(refunded_amount, 0) AS refunded_amount,
              method,
              created_at,
              updated_at,
              deleted_at,
              void_reason
            FROM payments
            WHERE created_by = $1
              AND idempotency_key = $2
              AND idempotency_key_client_supplied = true
              AND deleted_at IS NULL
            LIMIT 1
          `, [input.createdByUserId, input.idempotencyKey]);
                if (existingRes.rows.length > 0) {
                    const er = existingRes.rows[0];
                    if (Number(er.invoice_id) !== input.invoiceId ||
                        Math.abs(num(er.amount) - num(input.amount)) > 1e-9 ||
                        (0, billingTypes_1.normalizePaymentMethod)(String(er.method)) !== input.method) {
                        await client.query("ROLLBACK");
                        throw new errorHandler_1.ApiError(409, "Ключ идемпотентности уже использован с другими параметрами");
                    }
                    await client.query("COMMIT");
                    return mapPayment(er);
                }
            }
            const inv = await client.query(`
          SELECT total::numeric
          FROM invoices
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE
        `, [input.invoiceId]);
            if (inv.rows.length === 0) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(404, "Счёт не найден");
            }
            const total = num(inv.rows[0].total);
            const paidRes = await client.query(`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN p.deleted_at IS NULL
                  THEN GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0))
                  ELSE 0::numeric
                END
              ),
              0
            )::numeric AS s
          FROM payments p
          WHERE p.invoice_id = $1
        `, [input.invoiceId]);
            const paidSoFar = num(paidRes.rows[0]?.s ?? 0);
            const remaining = Math.round((total - paidSoFar + Number.EPSILON) * 100) / 100;
            const payAmount = num(input.amount);
            if (payAmount <= 0) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(400, "Сумма оплаты должна быть больше нуля");
            }
            if (payAmount > remaining + 1e-6) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(409, "Сумма оплаты превышает остаток");
            }
            const ins = await client.query(`
          INSERT INTO payments (
            invoice_id,
            amount,
            method,
            idempotency_key,
            idempotency_key_client_supplied,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
            id,
            invoice_id,
            amount,
            COALESCE(refunded_amount, 0) AS refunded_amount,
            method,
            created_at,
            updated_at,
            deleted_at,
            void_reason
        `, [
                input.invoiceId,
                input.amount,
                input.method,
                input.idempotencyKey,
                input.idempotencyKeyClientSupplied,
                input.createdByUserId,
            ]);
            const upd = await client.query(`
          UPDATE invoices
          SET status = $2, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id
        `, [input.invoiceId, nextInvoiceStatus]);
            if (upd.rows.length === 0) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(404, "Счёт не найден");
            }
            await client.query("COMMIT");
            return mapPayment(ins.rows[0]);
        }
        catch (err) {
            try {
                await client.query("ROLLBACK");
            }
            catch {
                /* ignore */
            }
            throw err;
        }
        finally {
            client.release();
        }
    }
    async delete(id, voidReason) {
        const result = await database_1.dbPool.query(`
        UPDATE payments
        SET
          deleted_at = NOW(),
          void_reason = $2,
          updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id
      `, [id, voidReason]);
        return result.rows.length > 0;
    }
    async deletePaymentUpdateInvoiceWithOptionalCash(input) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const del = await client.query(`
          UPDATE payments
          SET
            deleted_at = NOW(),
            void_reason = $2,
            updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id
        `, [input.paymentId, input.voidReason]);
            if (del.rows.length === 0) {
                await client.query("ROLLBACK");
                return { deleted: false };
            }
            const invUpd = await client.query(`
          UPDATE invoices
          SET status = $2, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id
        `, [input.invoiceId, input.nextInvoiceStatus]);
            if (invUpd.rows.length === 0) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(404, "Счёт не найден");
            }
            await client.query("COMMIT");
            return { deleted: true };
        }
        catch (err) {
            try {
                await client.query("ROLLBACK");
            }
            catch {
                /* ignore */
            }
            throw err;
        }
        finally {
            client.release();
        }
    }
    async findInvoiceByIdForPayment(id) {
        const result = await database_1.dbPool.query(`
        SELECT
          i.id,
          i.status,
          i.total,
          ${PAID_SUM_EXPR} AS paid_amount
        FROM invoices i
        LEFT JOIN payments p ON p.invoice_id = i.id
        WHERE i.id = $1
          AND i.deleted_at IS NULL
        GROUP BY i.id, i.status, i.total
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            id: Number(row.id),
            status: row.status,
            total: num(row.total),
            paidAmount: num(row.paid_amount),
        };
    }
    async updateInvoicePaymentState(invoiceId, _paidAmount, status) {
        const result = await database_1.dbPool.query(`
        UPDATE invoices
        SET status = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [invoiceId, status]);
        return result.rows.length > 0;
    }
    async applyRefund(input) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const upd = await client.query(`
          UPDATE payments
          SET
            refunded_amount = COALESCE(refunded_amount, 0) + $1::numeric,
            updated_at = NOW()
          WHERE id = $2
            AND deleted_at IS NULL
            AND (amount - COALESCE(refunded_amount, 0)) >= $1::numeric
          RETURNING id, amount, refunded_amount
        `, [input.refundAmount, input.paymentId]);
            if (upd.rows.length === 0) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(409, "Платёж уже возвращён");
            }
            const row = upd.rows[0];
            const totalRefunded = num(row.refunded_amount);
            const paymentAmount = num(row.amount);
            if (totalRefunded + 1e-6 >= paymentAmount) {
                await client.query(`
            UPDATE payments
            SET
              deleted_at = NOW(),
              void_reason = $2,
              updated_at = NOW()
            WHERE id = $1
          `, [input.paymentId, input.reason]);
            }
            const invUpd = await client.query(`
          UPDATE invoices
          SET status = $1, updated_at = NOW()
          WHERE id = $2 AND deleted_at IS NULL
          RETURNING id
        `, [input.newInvoiceStatus, input.invoiceId]);
            if (invUpd.rows.length === 0) {
                await client.query("ROLLBACK");
                throw new errorHandler_1.ApiError(404, "Счёт не найден");
            }
            await client.query(`
          INSERT INTO cash_register_entries (
            shift_id,
            payment_id,
            type,
            amount,
            method,
            note
          )
          VALUES ($1, $2, 'refund', $3, $4, $5)
        `, [
                input.shiftId,
                input.paymentId,
                input.refundAmount,
                input.method,
                input.cashNote,
            ]);
            await client.query("COMMIT");
            return { cashWrittenInRepo: true };
        }
        catch (err) {
            try {
                await client.query("ROLLBACK");
            }
            catch {
                /* ignore */
            }
            throw err;
        }
        finally {
            client.release();
        }
    }
}
exports.PostgresPaymentsRepository = PostgresPaymentsRepository;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvcmVwb3NpdG9yaWVzL3Bvc3RncmVzL1Bvc3RncmVzUGF5bWVudHNSZXBvc2l0b3J5LnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9yZXBvc2l0b3JpZXMvcG9zdGdyZXMvUG9zdGdyZXNQYXltZW50c1JlcG9zaXRvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBVUEsNkRBQW9FO0FBQ3BFLG9EQUErQztBQUMvQyxnRUFBeUQ7QUFDekQsaURBQXVEO0FBY3ZELE1BQU0sS0FBSyxHQUFHLENBQUMsS0FBb0IsRUFBVSxFQUFFO0lBQzdDLElBQUksS0FBSyxZQUFZLElBQUk7UUFBRSxPQUFPLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN0RCxPQUFPLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3ZDLENBQUMsQ0FBQztBQUVGLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBa0IsRUFBVSxFQUFFLENBQUMsSUFBQSwwQkFBZ0IsRUFBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFbkUsTUFBTSxVQUFVLEdBQUcsQ0FBQyxHQUFlLEVBQVcsRUFBRSxDQUFDLENBQUM7SUFDaEQsRUFBRSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0lBQ2xCLFNBQVMsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQztJQUNqQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDdkIsY0FBYyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLENBQUMsQ0FBQztJQUM3QyxNQUFNLEVBQUUsSUFBQSxxQ0FBc0IsRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2xELFNBQVMs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Q2YsS0FBSyxDQUFDLFlBQVk7Z0JBQ2xCLEtBQUssQ0FBQyxNQUFNO2dCQUNaLEtBQUssQ0FBQyxRQUFRO2FBQ2YsQ0FDRixDQUFDO1lBRUYsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUNyQyxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDakMsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxZQUFZO1lBQ2QsQ0FBQztZQUNELE1BQU0sR0FBRyxDQUFDO1FBQ1osQ0FBQztnQkFBUyxDQUFDO1lBQ1QsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUE5Z0JELGdFQThnQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IElQYXltZW50c1JlcG9zaXRvcnkgfSBmcm9tIFwiLi4vaW50ZXJmYWNlcy9JUGF5bWVudHNSZXBvc2l0b3J5XCI7XHJcbmltcG9ydCB0eXBlIHtcclxuICBJbnZvaWNlRm9yUGF5bWVudCxcclxuICBJbnZvaWNlU3RhdHVzLFxyXG4gIFBheW1lbnQsXHJcbiAgUGF5bWVudENyZWF0ZUlucHV0LFxyXG4gIFBheW1lbnREZWxldGVXaXRoSW52b2ljZUFuZENhc2hJbnB1dCxcclxuICBQYXltZW50RmlsdGVycyxcclxuICBQYXltZW50UmVmdW5kQXBwbHlJbnB1dCxcclxufSBmcm9tIFwiLi4vaW50ZXJmYWNlcy9iaWxsaW5nVHlwZXNcIjtcclxuaW1wb3J0IHsgbm9ybWFsaXplUGF5bWVudE1ldGhvZCB9IGZyb20gXCIuLi9pbnRlcmZhY2VzL2JpbGxpbmdUeXBlc1wiO1xyXG5pbXBvcnQgeyBkYlBvb2wgfSBmcm9tIFwiLi4vLi4vY29uZmlnL2RhdGFiYXNlXCI7XHJcbmltcG9ydCB7IEFwaUVycm9yIH0gZnJvbSBcIi4uLy4uL21pZGRsZXdhcmUvZXJyb3JIYW5kbGVyXCI7XHJcbmltcG9ydCB7IHBhcnNlTW9uZXlDb2x1bW4gfSBmcm9tIFwiLi4vLi4vdXRpbHMvbnVtYmVyc1wiO1xyXG5cclxudHlwZSBQYXltZW50Um93ID0ge1xyXG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgaW52b2ljZV9pZDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gIGFtb3VudDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gIHJlZnVuZGVkX2Ftb3VudD86IHN0cmluZyB8IG51bWJlciB8IG51bGw7XHJcbiAgbWV0aG9kOiBzdHJpbmc7XHJcbiAgY3JlYXRlZF9hdDogRGF0ZSB8IHN0cmluZztcclxuICB1cGRhdGVkX2F0PzogRGF0ZSB8IHN0cmluZztcclxuICBkZWxldGVkX2F0OiBEYXRlIHwgc3RyaW5nIHwgbnVsbDtcclxuICB2b2lkX3JlYXNvbjogc3RyaW5nIHwgbnVsbDtcclxufTtcclxuXHJcbmNvbnN0IHRvSXNvID0gKHZhbHVlOiBEYXRlIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcclxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSByZXR1cm4gdmFsdWUudG9JU09TdHJpbmcoKTtcclxuICByZXR1cm4gbmV3IERhdGUodmFsdWUpLnRvSVNPU3RyaW5nKCk7XHJcbn07XHJcblxyXG5jb25zdCBudW0gPSAodjogc3RyaW5nIHwgbnVtYmVyKTogbnVtYmVyID0+IHBhcnNlTW9uZXlDb2x1bW4odiwgMCk7XHJcblxyXG5jb25zdCBtYXBQYXltZW50ID0gKHJvdzogUGF5bWVudFJvdyk6IFBheW1lbnQgPT4gKHtcclxuICBpZDogTnVtYmVyKHJvdy5pZCksXHJcbiAgaW52b2ljZUlkOiBOdW1iZXIocm93Lmludm9pY2VfaWQpLFxyXG4gIGFtb3VudDogbnVtKHJvdy5hbW91bnQpLFxyXG4gIHJlZnVuZGVkQW1vdW50OiBudW0ocm93LnJlZnVuZGVkX2Ftb3VudCA/PyAwKSxcclxuICBtZXRob2Q6IG5vcm1hbGl6ZVBheW1lbnRNZXRob2QoU3RyaW5nKHJvdy5tZXRob2QpKSxcclxuICBjcmVhdGVkQXQ6IHRvSXNvKHJvdy5jcmVhdGVkX2F0KSxcclxuICB1cGRhdGVkQXQ6IHRvSXNvKHJvdy51cGRhdGVkX2F0ID8/IHJvdy5jcmVhdGVkX2F0KSxcclxuICBkZWxldGVkQXQ6IHJvdy5kZWxldGVkX2F0ID8gdG9Jc28ocm93LmRlbGV0ZWRfYXQpIDogbnVsbCxcclxuICB2b2lkUmVhc29uOiByb3cudm9pZF9yZWFzb24sXHJcbn0pO1xyXG5cclxuY29uc3QgUEFJRF9TVU1fRVhQUiA9IGBcclxuICBDT0FMRVNDRShTVU0oXHJcbiAgICBDQVNFXHJcbiAgICAgIFdIRU4gcC5kZWxldGVkX2F0IElTIE5VTEwgVEhFTiBHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSlcclxuICAgICAgRUxTRSAwOjpudW1lcmljXHJcbiAgICBFTkRcclxuICApLCAwKTo6bnVtZXJpY2A7XHJcblxyXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNQYXltZW50c1JlcG9zaXRvcnkgaW1wbGVtZW50cyBJUGF5bWVudHNSZXBvc2l0b3J5IHtcclxuICBhc3luYyBmaW5kQWxsKGZpbHRlcnM6IFBheW1lbnRGaWx0ZXJzID0ge30pOiBQcm9taXNlPFBheW1lbnRbXT4ge1xyXG4gICAgY29uc3QgY2xhdXNlczogc3RyaW5nW10gPSBbXCJkZWxldGVkX2F0IElTIE5VTExcIl07XHJcbiAgICBjb25zdCB2YWx1ZXM6IEFycmF5PG51bWJlciB8IHN0cmluZz4gPSBbXTtcclxuXHJcbiAgICBpZiAoZmlsdGVycy5pbnZvaWNlSWQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB2YWx1ZXMucHVzaChmaWx0ZXJzLmludm9pY2VJZCk7XHJcbiAgICAgIGNsYXVzZXMucHVzaChgaW52b2ljZV9pZCA9ICQke3ZhbHVlcy5sZW5ndGh9YCk7XHJcbiAgICB9XHJcbiAgICBpZiAoZmlsdGVycy5tZXRob2QgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB2YWx1ZXMucHVzaChmaWx0ZXJzLm1ldGhvZCk7XHJcbiAgICAgIGNsYXVzZXMucHVzaChcclxuICAgICAgICBgKENBU0UgV0hFTiBtZXRob2QgPSAnY2FzaCcgVEhFTiAnY2FzaCcgRUxTRSAnY2FyZCcgRU5EKSA9ICQke3ZhbHVlcy5sZW5ndGh9YFxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiUG9vbC5xdWVyeTxQYXltZW50Um93PihcclxuICAgICAgYFxyXG4gICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgaWQsXHJcbiAgICAgICAgICBpbnZvaWNlX2lkLFxyXG4gICAgICAgICAgYW1vdW50LFxyXG4gICAgICAgICAgQ09BTEVTQ0UocmVmdW5kZWRfYW1vdW50LCAwKSBBUyByZWZ1bmRlZF9hbW91bnQsXHJcbiAgICAgICAgICBtZXRob2QsXHJcbiAgICAgICAgICBjcmVhdGVkX2F0LFxyXG4gICAgICAgICAgdXBkYXRlZF9hdCxcclxuICAgICAgICAgIGRlbGV0ZWRfYXQsXHJcbiAgICAgICAgICB2b2lkX3JlYXNvblxyXG4gICAgICAgIEZST00gcGF5bWVudHNcclxuICAgICAgICBXSEVSRSAke2NsYXVzZXMuam9pbihcIiBBTkQgXCIpfVxyXG4gICAgICAgIE9SREVSIEJZIGNyZWF0ZWRfYXQgREVTQ1xyXG4gICAgICBgLFxyXG4gICAgICB2YWx1ZXNcclxuICAgICk7XHJcbiAgICByZXR1cm4gcmVzdWx0LnJvd3MubWFwKG1hcFBheW1lbnQpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZmluZEJ5SWQoaWQ6IG51bWJlcik6IFByb21pc2U8UGF5bWVudCB8IG51bGw+IHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiUG9vbC5xdWVyeTxQYXltZW50Um93PihcclxuICAgICAgYFxyXG4gICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgaWQsXHJcbiAgICAgICAgICBpbnZvaWNlX2lkLFxyXG4gICAgICAgICAgYW1vdW50LFxyXG4gICAgICAgICAgQ09BTEVTQ0UocmVmdW5kZWRfYW1vdW50LCAwKSBBUyByZWZ1bmRlZF9hbW91bnQsXHJcbiAgICAgICAgICBtZXRob2QsXHJcbiAgICAgICAgICBjcmVhdGVkX2F0LFxyXG4gICAgICAgICAgdXBkYXRlZF9hdCxcclxuICAgICAgICAgIGRlbGV0ZWRfYXQsXHJcbiAgICAgICAgICB2b2lkX3JlYXNvblxyXG4gICAgICAgIEZST00gcGF5bWVudHNcclxuICAgICAgICBXSEVSRSBpZCA9ICQxXHJcbiAgICAgICAgICBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgTElNSVQgMVxyXG4gICAgICBgLFxyXG4gICAgICBbaWRdXHJcbiAgICApO1xyXG4gICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiBtYXBQYXltZW50KHJlc3VsdC5yb3dzWzBdKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGZpbmRCeUlkSW5jbHVkaW5nVm9pZGVkKGlkOiBudW1iZXIpOiBQcm9taXNlPFBheW1lbnQgfCBudWxsPiB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8UGF5bWVudFJvdz4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIGlkLFxyXG4gICAgICAgICAgaW52b2ljZV9pZCxcclxuICAgICAgICAgIGFtb3VudCxcclxuICAgICAgICAgIENPQUxFU0NFKHJlZnVuZGVkX2Ftb3VudCwgMCkgQVMgcmVmdW5kZWRfYW1vdW50LFxyXG4gICAgICAgICAgbWV0aG9kLFxyXG4gICAgICAgICAgY3JlYXRlZF9hdCxcclxuICAgICAgICAgIHVwZGF0ZWRfYXQsXHJcbiAgICAgICAgICBkZWxldGVkX2F0LFxyXG4gICAgICAgICAgdm9pZF9yZWFzb25cclxuICAgICAgICBGUk9NIHBheW1lbnRzXHJcbiAgICAgICAgV0hFUkUgaWQgPSAkMVxyXG4gICAgICAgIExJTUlUIDFcclxuICAgICAgYCxcclxuICAgICAgW2lkXVxyXG4gICAgKTtcclxuICAgIGlmIChyZXN1bHQucm93cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbWFwUGF5bWVudChyZXN1bHQucm93c1swXSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBmaW5kQWN0aXZlUGF5bWVudEJ5SWRlbXBvdGVuY3lLZXkoXHJcbiAgICB1c2VySWQ6IG51bWJlcixcclxuICAgIGtleTogc3RyaW5nXHJcbiAgKTogUHJvbWlzZTxQYXltZW50IHwgbnVsbD4ge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGJQb29sLnF1ZXJ5PFBheW1lbnRSb3c+KFxyXG4gICAgICBgXHJcbiAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICBpZCxcclxuICAgICAgICAgIGludm9pY2VfaWQsXHJcbiAgICAgICAgICBhbW91bnQsXHJcbiAgICAgICAgICBDT0FMRVNDRShyZWZ1bmRlZF9hbW91bnQsIDApIEFTIHJlZnVuZGVkX2Ftb3VudCxcclxuICAgICAgICAgIG1ldGhvZCxcclxuICAgICAgICAgIGNyZWF0ZWRfYXQsXHJcbiAgICAgICAgICB1cGRhdGVkX2F0LFxyXG4gICAgICAgICAgZGVsZXRlZF9hdCxcclxuICAgICAgICAgIHZvaWRfcmVhc29uXHJcbiAgICAgICAgRlJPTSBwYXltZW50c1xyXG4gICAgICAgIFdIRVJFIGNyZWF0ZWRfYnkgPSAkMVxyXG4gICAgICAgICAgQU5EIGlkZW1wb3RlbmN5X2tleSA9ICQyXHJcbiAgICAgICAgICBBTkQgaWRlbXBvdGVuY3lfa2V5X2NsaWVudF9zdXBwbGllZCA9IHRydWVcclxuICAgICAgICAgIEFORCBkZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICBMSU1JVCAxXHJcbiAgICAgIGAsXHJcbiAgICAgIFt1c2VySWQsIGtleV1cclxuICAgICk7XHJcbiAgICBpZiAocmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1hcFBheW1lbnQocmVzdWx0LnJvd3NbMF0pO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgY3JlYXRlKGlucHV0OiBQYXltZW50Q3JlYXRlSW5wdXQpOiBQcm9taXNlPFBheW1lbnQ+IHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiUG9vbC5xdWVyeTxQYXltZW50Um93PihcclxuICAgICAgYFxyXG4gICAgICAgIElOU0VSVCBJTlRPIHBheW1lbnRzIChcclxuICAgICAgICAgIGludm9pY2VfaWQsXHJcbiAgICAgICAgICBhbW91bnQsXHJcbiAgICAgICAgICBtZXRob2QsXHJcbiAgICAgICAgICBpZGVtcG90ZW5jeV9rZXksXHJcbiAgICAgICAgICBpZGVtcG90ZW5jeV9rZXlfY2xpZW50X3N1cHBsaWVkLFxyXG4gICAgICAgICAgY3JlYXRlZF9ieVxyXG4gICAgICAgIClcclxuICAgICAgICBWQUxVRVMgKCQxLCAkMiwgJDMsICQ0LCAkNSwgJDYpXHJcbiAgICAgICAgUkVUVVJOSU5HXHJcbiAgICAgICAgICBpZCxcclxuICAgICAgICAgIGludm9pY2VfaWQsXHJcbiAgICAgICAgICBhbW91bnQsXHJcbiAgICAgICAgICBDT0FMRVNDRShyZWZ1bmRlZF9hbW91bnQsIDApIEFTIHJlZnVuZGVkX2Ftb3VudCxcclxuICAgICAgICAgIG1ldGhvZCxcclxuICAgICAgICAgIGNyZWF0ZWRfYXQsXHJcbiAgICAgICAgICB1cGRhdGVkX2F0LFxyXG4gICAgICAgICAgZGVsZXRlZF9hdCxcclxuICAgICAgICAgIHZvaWRfcmVhc29uXHJcbiAgICAgIGAsXHJcbiAgICAgIFtcclxuICAgICAgICBpbnB1dC5pbnZvaWNlSWQsXHJcbiAgICAgICAgaW5wdXQuYW1vdW50LFxyXG4gICAgICAgIGlucHV0Lm1ldGhvZCxcclxuICAgICAgICBpbnB1dC5pZGVtcG90ZW5jeUtleSxcclxuICAgICAgICBpbnB1dC5pZGVtcG90ZW5jeUtleUNsaWVudFN1cHBsaWVkLFxyXG4gICAgICAgIGlucHV0LmNyZWF0ZWRCeVVzZXJJZCxcclxuICAgICAgXVxyXG4gICAgKTtcclxuICAgIHJldHVybiBtYXBQYXltZW50KHJlc3VsdC5yb3dzWzBdKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGNyZWF0ZVBheW1lbnRBbmRVcGRhdGVJbnZvaWNlKFxyXG4gICAgaW5wdXQ6IFBheW1lbnRDcmVhdGVJbnB1dCxcclxuICAgIG5leHRJbnZvaWNlU3RhdHVzOiBJbnZvaWNlU3RhdHVzXHJcbiAgKTogUHJvbWlzZTxQYXltZW50PiB7XHJcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCBkYlBvb2wuY29ubmVjdCgpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiQkVHSU5cIik7XHJcblxyXG4gICAgICBpZiAoaW5wdXQuaWRlbXBvdGVuY3lLZXlDbGllbnRTdXBwbGllZCkge1xyXG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgU0VMRUNUIHBnX2Fkdmlzb3J5X3hhY3RfbG9jayhoYXNodGV4dCgkMTo6dGV4dCkpYCwgW1xyXG4gICAgICAgICAgYHBheW1lbnRfaWRlbToke2lucHV0LmNyZWF0ZWRCeVVzZXJJZH06JHtpbnB1dC5pZGVtcG90ZW5jeUtleX1gLFxyXG4gICAgICAgIF0pO1xyXG5cclxuICAgICAgICBjb25zdCBleGlzdGluZ1JlcyA9IGF3YWl0IGNsaWVudC5xdWVyeTxQYXltZW50Um93PihcclxuICAgICAgICAgIGBcclxuICAgICAgICAgICAgU0VMRUNUXHJcbiAgICAgICAgICAgICAgaWQsXHJcbiAgICAgICAgICAgICAgaW52b2ljZV9pZCxcclxuICAgICAgICAgICAgICBhbW91bnQsXHJcbiAgICAgICAgICAgICAgQ09BTEVTQ0UocmVmdW5kZWRfYW1vdW50LCAwKSBBUyByZWZ1bmRlZF9hbW91bnQsXHJcbiAgICAgICAgICAgICAgbWV0aG9kLFxyXG4gICAgICAgICAgICAgIGNyZWF0ZWRfYXQsXHJcbiAgICAgICAgICAgICAgdXBkYXRlZF9hdCxcclxuICAgICAgICAgICAgICBkZWxldGVkX2F0LFxyXG4gICAgICAgICAgICAgIHZvaWRfcmVhc29uXHJcbiAgICAgICAgICAgIEZST00gcGF5bWVudHNcclxuICAgICAgICAgICAgV0hFUkUgY3JlYXRlZF9ieSA9ICQxXHJcbiAgICAgICAgICAgICAgQU5EIGlkZW1wb3RlbmN5X2tleSA9ICQyXHJcbiAgICAgICAgICAgICAgQU5EIGlkZW1wb3RlbmN5X2tleV9jbGllbnRfc3VwcGxpZWQgPSB0cnVlXHJcbiAgICAgICAgICAgICAgQU5EIGRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBMSU1JVCAxXHJcbiAgICAgICAgICBgLFxyXG4gICAgICAgICAgW2lucHV0LmNyZWF0ZWRCeVVzZXJJZCwgaW5wdXQuaWRlbXBvdGVuY3lLZXldXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoZXhpc3RpbmdSZXMucm93cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBjb25zdCBlciA9IGV4aXN0aW5nUmVzLnJvd3NbMF07XHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIE51bWJlcihlci5pbnZvaWNlX2lkKSAhPT0gaW5wdXQuaW52b2ljZUlkIHx8XHJcbiAgICAgICAgICAgIE1hdGguYWJzKG51bShlci5hbW91bnQpIC0gbnVtKGlucHV0LmFtb3VudCkpID4gMWUtOSB8fFxyXG4gICAgICAgICAgICBub3JtYWxpemVQYXltZW50TWV0aG9kKFN0cmluZyhlci5tZXRob2QpKSAhPT0gaW5wdXQubWV0aG9kXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBBcGlFcnJvcihcclxuICAgICAgICAgICAgICA0MDksXHJcbiAgICAgICAgICAgICAgXCLQmtC70Y7RhyDQuNC00LXQvNC/0L7RgtC10L3RgtC90L7RgdGC0Lgg0YPQttC1INC40YHQv9C+0LvRjNC30L7QstCw0L0g0YEg0LTRgNGD0LPQuNC80Lgg0L/QsNGA0LDQvNC10YLRgNCw0LzQuFwiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJDT01NSVRcIik7XHJcbiAgICAgICAgICByZXR1cm4gbWFwUGF5bWVudChlcik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBpbnYgPSBhd2FpdCBjbGllbnQucXVlcnk8eyB0b3RhbDogc3RyaW5nIHwgbnVtYmVyIH0+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVCB0b3RhbDo6bnVtZXJpY1xyXG4gICAgICAgICAgRlJPTSBpbnZvaWNlc1xyXG4gICAgICAgICAgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICBGT1IgVVBEQVRFXHJcbiAgICAgICAgYCxcclxuICAgICAgICBbaW5wdXQuaW52b2ljZUlkXVxyXG4gICAgICApO1xyXG4gICAgICBpZiAoaW52LnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwNCwgXCLQodGH0ZHRgiDQvdC1INC90LDQudC00LXQvVwiKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgdG90YWwgPSBudW0oaW52LnJvd3NbMF0udG90YWwpO1xyXG4gICAgICBjb25zdCBwYWlkUmVzID0gYXdhaXQgY2xpZW50LnF1ZXJ5PHsgczogc3RyaW5nIHwgbnVtYmVyIH0+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgICBDT0FMRVNDRShcclxuICAgICAgICAgICAgICBTVU0oXHJcbiAgICAgICAgICAgICAgICBDQVNFXHJcbiAgICAgICAgICAgICAgICAgIFdIRU4gcC5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgICAgICAgICAgVEhFTiBHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSlcclxuICAgICAgICAgICAgICAgICAgRUxTRSAwOjpudW1lcmljXHJcbiAgICAgICAgICAgICAgICBFTkRcclxuICAgICAgICAgICAgICApLFxyXG4gICAgICAgICAgICAgIDBcclxuICAgICAgICAgICAgKTo6bnVtZXJpYyBBUyBzXHJcbiAgICAgICAgICBGUk9NIHBheW1lbnRzIHBcclxuICAgICAgICAgIFdIRVJFIHAuaW52b2ljZV9pZCA9ICQxXHJcbiAgICAgICAgYCxcclxuICAgICAgICBbaW5wdXQuaW52b2ljZUlkXVxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCBwYWlkU29GYXIgPSBudW0ocGFpZFJlcy5yb3dzWzBdPy5zID8/IDApO1xyXG4gICAgICBjb25zdCByZW1haW5pbmcgPSBNYXRoLnJvdW5kKCh0b3RhbCAtIHBhaWRTb0ZhciArIE51bWJlci5FUFNJTE9OKSAqIDEwMCkgLyAxMDA7XHJcbiAgICAgIGNvbnN0IHBheUFtb3VudCA9IG51bShpbnB1dC5hbW91bnQpO1xyXG5cclxuICAgICAgaWYgKHBheUFtb3VudCA8PSAwKSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwMCwgXCLQodGD0LzQvNCwINC+0L/Qu9Cw0YLRiyDQtNC+0LvQttC90LAg0LHRi9GC0Ywg0LHQvtC70YzRiNC1INC90YPQu9GPXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChwYXlBbW91bnQgPiByZW1haW5pbmcgKyAxZS02KSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwOSwgXCLQodGD0LzQvNCwINC+0L/Qu9Cw0YLRiyDQv9GA0LXQstGL0YjQsNC10YIg0L7RgdGC0LDRgtC+0LpcIik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGlucyA9IGF3YWl0IGNsaWVudC5xdWVyeTxQYXltZW50Um93PihcclxuICAgICAgICBgXHJcbiAgICAgICAgICBJTlNFUlQgSU5UTyBwYXltZW50cyAoXHJcbiAgICAgICAgICAgIGludm9pY2VfaWQsXHJcbiAgICAgICAgICAgIGFtb3VudCxcclxuICAgICAgICAgICAgbWV0aG9kLFxyXG4gICAgICAgICAgICBpZGVtcG90ZW5jeV9rZXksXHJcbiAgICAgICAgICAgIGlkZW1wb3RlbmN5X2tleV9jbGllbnRfc3VwcGxpZWQsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRfYnlcclxuICAgICAgICAgIClcclxuICAgICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMywgJDQsICQ1LCAkNilcclxuICAgICAgICAgIFJFVFVSTklOR1xyXG4gICAgICAgICAgICBpZCxcclxuICAgICAgICAgICAgaW52b2ljZV9pZCxcclxuICAgICAgICAgICAgYW1vdW50LFxyXG4gICAgICAgICAgICBDT0FMRVNDRShyZWZ1bmRlZF9hbW91bnQsIDApIEFTIHJlZnVuZGVkX2Ftb3VudCxcclxuICAgICAgICAgICAgbWV0aG9kLFxyXG4gICAgICAgICAgICBjcmVhdGVkX2F0LFxyXG4gICAgICAgICAgICB1cGRhdGVkX2F0LFxyXG4gICAgICAgICAgICBkZWxldGVkX2F0LFxyXG4gICAgICAgICAgICB2b2lkX3JlYXNvblxyXG4gICAgICAgIGAsXHJcbiAgICAgICAgW1xyXG4gICAgICAgICAgaW5wdXQuaW52b2ljZUlkLFxyXG4gICAgICAgICAgaW5wdXQuYW1vdW50LFxyXG4gICAgICAgICAgaW5wdXQubWV0aG9kLFxyXG4gICAgICAgICAgaW5wdXQuaWRlbXBvdGVuY3lLZXksXHJcbiAgICAgICAgICBpbnB1dC5pZGVtcG90ZW5jeUtleUNsaWVudFN1cHBsaWVkLFxyXG4gICAgICAgICAgaW5wdXQuY3JlYXRlZEJ5VXNlcklkLFxyXG4gICAgICAgIF1cclxuICAgICAgKTtcclxuXHJcbiAgICAgIGNvbnN0IHVwZCA9IGF3YWl0IGNsaWVudC5xdWVyeTx7IGlkOiBudW1iZXIgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgICAgVVBEQVRFIGludm9pY2VzXHJcbiAgICAgICAgICBTRVQgc3RhdHVzID0gJDIsIHVwZGF0ZWRfYXQgPSBOT1coKVxyXG4gICAgICAgICAgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICBSRVRVUk5JTkcgaWRcclxuICAgICAgICBgLFxyXG4gICAgICAgIFtpbnB1dC5pbnZvaWNlSWQsIG5leHRJbnZvaWNlU3RhdHVzXVxyXG4gICAgICApO1xyXG4gICAgICBpZiAodXBkLnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwNCwgXCLQodGH0ZHRgiDQvdC1INC90LDQudC00LXQvVwiKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiQ09NTUlUXCIpO1xyXG4gICAgICByZXR1cm4gbWFwUGF5bWVudChpbnMucm93c1swXSk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcclxuICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgLyogaWdub3JlICovXHJcbiAgICAgIH1cclxuICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgY2xpZW50LnJlbGVhc2UoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIGRlbGV0ZShpZDogbnVtYmVyLCB2b2lkUmVhc29uOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8eyBpZDogbnVtYmVyIH0+KFxyXG4gICAgICBgXHJcbiAgICAgICAgVVBEQVRFIHBheW1lbnRzXHJcbiAgICAgICAgU0VUXHJcbiAgICAgICAgICBkZWxldGVkX2F0ID0gTk9XKCksXHJcbiAgICAgICAgICB2b2lkX3JlYXNvbiA9ICQyLFxyXG4gICAgICAgICAgdXBkYXRlZF9hdCA9IE5PVygpXHJcbiAgICAgICAgV0hFUkUgaWQgPSAkMVxyXG4gICAgICAgICAgQU5EIGRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgIFJFVFVSTklORyBpZFxyXG4gICAgICBgLFxyXG4gICAgICBbaWQsIHZvaWRSZWFzb25dXHJcbiAgICApO1xyXG4gICAgcmV0dXJuIHJlc3VsdC5yb3dzLmxlbmd0aCA+IDA7XHJcbiAgfVxyXG5cclxuICBhc3luYyBkZWxldGVQYXltZW50VXBkYXRlSW52b2ljZVdpdGhPcHRpb25hbENhc2goXHJcbiAgICBpbnB1dDogUGF5bWVudERlbGV0ZVdpdGhJbnZvaWNlQW5kQ2FzaElucHV0XHJcbiAgKTogUHJvbWlzZTx7IGRlbGV0ZWQ6IGJvb2xlYW4gfT4ge1xyXG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgZGJQb29sLmNvbm5lY3QoKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkJFR0lOXCIpO1xyXG5cclxuICAgICAgY29uc3QgZGVsID0gYXdhaXQgY2xpZW50LnF1ZXJ5PHsgaWQ6IG51bWJlciB9PihcclxuICAgICAgICBgXHJcbiAgICAgICAgICBVUERBVEUgcGF5bWVudHNcclxuICAgICAgICAgIFNFVFxyXG4gICAgICAgICAgICBkZWxldGVkX2F0ID0gTk9XKCksXHJcbiAgICAgICAgICAgIHZvaWRfcmVhc29uID0gJDIsXHJcbiAgICAgICAgICAgIHVwZGF0ZWRfYXQgPSBOT1coKVxyXG4gICAgICAgICAgV0hFUkUgaWQgPSAkMVxyXG4gICAgICAgICAgICBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICBSRVRVUk5JTkcgaWRcclxuICAgICAgICBgLFxyXG4gICAgICAgIFtpbnB1dC5wYXltZW50SWQsIGlucHV0LnZvaWRSZWFzb25dXHJcbiAgICAgICk7XHJcbiAgICAgIGlmIChkZWwucm93cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcclxuICAgICAgICByZXR1cm4geyBkZWxldGVkOiBmYWxzZSB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBpbnZVcGQgPSBhd2FpdCBjbGllbnQucXVlcnk8eyBpZDogbnVtYmVyIH0+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFVQREFURSBpbnZvaWNlc1xyXG4gICAgICAgICAgU0VUIHN0YXR1cyA9ICQyLCB1cGRhdGVkX2F0ID0gTk9XKClcclxuICAgICAgICAgIFdIRVJFIGlkID0gJDEgQU5EIGRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgUkVUVVJOSU5HIGlkXHJcbiAgICAgICAgYCxcclxuICAgICAgICBbaW5wdXQuaW52b2ljZUlkLCBpbnB1dC5uZXh0SW52b2ljZVN0YXR1c11cclxuICAgICAgKTtcclxuICAgICAgaWYgKGludlVwZC5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIlJPTExCQUNLXCIpO1xyXG4gICAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwi0KHRh9GR0YIg0L3QtSDQvdCw0LnQtNC10L1cIik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcclxuICAgICAgcmV0dXJuIHsgZGVsZXRlZDogdHJ1ZSB9O1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgIC8qIGlnbm9yZSAqL1xyXG4gICAgICB9XHJcbiAgICAgIHRocm93IGVycjtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIGNsaWVudC5yZWxlYXNlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBmaW5kSW52b2ljZUJ5SWRGb3JQYXltZW50KGlkOiBudW1iZXIpOiBQcm9taXNlPEludm9pY2VGb3JQYXltZW50IHwgbnVsbD4ge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGJQb29sLnF1ZXJ5PHtcclxuICAgICAgaWQ6IHN0cmluZyB8IG51bWJlcjtcclxuICAgICAgc3RhdHVzOiBJbnZvaWNlU3RhdHVzO1xyXG4gICAgICB0b3RhbDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gICAgICBwYWlkX2Ftb3VudDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gICAgfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIGkuaWQsXHJcbiAgICAgICAgICBpLnN0YXR1cyxcclxuICAgICAgICAgIGkudG90YWwsXHJcbiAgICAgICAgICAke1BBSURfU1VNX0VYUFJ9IEFTIHBhaWRfYW1vdW50XHJcbiAgICAgICAgRlJPTSBpbnZvaWNlcyBpXHJcbiAgICAgICAgTEVGVCBKT0lOIHBheW1lbnRzIHAgT04gcC5pbnZvaWNlX2lkID0gaS5pZFxyXG4gICAgICAgIFdIRVJFIGkuaWQgPSAkMVxyXG4gICAgICAgICAgQU5EIGkuZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgR1JPVVAgQlkgaS5pZCwgaS5zdGF0dXMsIGkudG90YWxcclxuICAgICAgICBMSU1JVCAxXHJcbiAgICAgIGAsXHJcbiAgICAgIFtpZF1cclxuICAgICk7XHJcbiAgICBpZiAocmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgcm93ID0gcmVzdWx0LnJvd3NbMF07XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpZDogTnVtYmVyKHJvdy5pZCksXHJcbiAgICAgIHN0YXR1czogcm93LnN0YXR1cyxcclxuICAgICAgdG90YWw6IG51bShyb3cudG90YWwpLFxyXG4gICAgICBwYWlkQW1vdW50OiBudW0ocm93LnBhaWRfYW1vdW50KSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGRhdGVJbnZvaWNlUGF5bWVudFN0YXRlKFxyXG4gICAgaW52b2ljZUlkOiBudW1iZXIsXHJcbiAgICBfcGFpZEFtb3VudDogbnVtYmVyLFxyXG4gICAgc3RhdHVzOiBJbnZvaWNlU3RhdHVzXHJcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8eyBpZDogbnVtYmVyIH0+KFxyXG4gICAgICBgXHJcbiAgICAgICAgVVBEQVRFIGludm9pY2VzXHJcbiAgICAgICAgU0VUIHN0YXR1cyA9ICQyLCB1cGRhdGVkX2F0ID0gTk9XKClcclxuICAgICAgICBXSEVSRSBpZCA9ICQxIEFORCBkZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICBSRVRVUk5JTkcgaWRcclxuICAgICAgYCxcclxuICAgICAgW2ludm9pY2VJZCwgc3RhdHVzXVxyXG4gICAgKTtcclxuICAgIHJldHVybiByZXN1bHQucm93cy5sZW5ndGggPiAwO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgYXBwbHlSZWZ1bmQoaW5wdXQ6IFBheW1lbnRSZWZ1bmRBcHBseUlucHV0KTogUHJvbWlzZTx7IGNhc2hXcml0dGVuSW5SZXBvOiBib29sZWFuIH0+IHtcclxuICAgIGNvbnN0IGNsaWVudCA9IGF3YWl0IGRiUG9vbC5jb25uZWN0KCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcclxuXHJcbiAgICAgIGNvbnN0IHVwZCA9IGF3YWl0IGNsaWVudC5xdWVyeTx7XHJcbiAgICAgICAgaWQ6IHN0cmluZyB8IG51bWJlcjtcclxuICAgICAgICBhbW91bnQ6IHN0cmluZyB8IG51bWJlcjtcclxuICAgICAgICByZWZ1bmRlZF9hbW91bnQ6IHN0cmluZyB8IG51bWJlcjtcclxuICAgICAgfT4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgICAgVVBEQVRFIHBheW1lbnRzXHJcbiAgICAgICAgICBTRVRcclxuICAgICAgICAgICAgcmVmdW5kZWRfYW1vdW50ID0gQ09BTEVTQ0UocmVmdW5kZWRfYW1vdW50LCAwKSArICQxOjpudW1lcmljLFxyXG4gICAgICAgICAgICB1cGRhdGVkX2F0ID0gTk9XKClcclxuICAgICAgICAgIFdIRVJFIGlkID0gJDJcclxuICAgICAgICAgICAgQU5EIGRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgICAgICBBTkQgKGFtb3VudCAtIENPQUxFU0NFKHJlZnVuZGVkX2Ftb3VudCwgMCkpID49ICQxOjpudW1lcmljXHJcbiAgICAgICAgICBSRVRVUk5JTkcgaWQsIGFtb3VudCwgcmVmdW5kZWRfYW1vdW50XHJcbiAgICAgICAgYCxcclxuICAgICAgICBbaW5wdXQucmVmdW5kQW1vdW50LCBpbnB1dC5wYXltZW50SWRdXHJcbiAgICAgICk7XHJcblxyXG4gICAgICBpZiAodXBkLnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKDQwOSwgXCLQn9C70LDRgtGR0LYg0YPQttC1INCy0L7Qt9Cy0YDQsNGJ0ZHQvVwiKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3Qgcm93ID0gdXBkLnJvd3NbMF07XHJcbiAgICAgIGNvbnN0IHRvdGFsUmVmdW5kZWQgPSBudW0ocm93LnJlZnVuZGVkX2Ftb3VudCk7XHJcbiAgICAgIGNvbnN0IHBheW1lbnRBbW91bnQgPSBudW0ocm93LmFtb3VudCk7XHJcbiAgICAgIGlmICh0b3RhbFJlZnVuZGVkICsgMWUtNiA+PSBwYXltZW50QW1vdW50KSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFxyXG4gICAgICAgICAgYFxyXG4gICAgICAgICAgICBVUERBVEUgcGF5bWVudHNcclxuICAgICAgICAgICAgU0VUXHJcbiAgICAgICAgICAgICAgZGVsZXRlZF9hdCA9IE5PVygpLFxyXG4gICAgICAgICAgICAgIHZvaWRfcmVhc29uID0gJDIsXHJcbiAgICAgICAgICAgICAgdXBkYXRlZF9hdCA9IE5PVygpXHJcbiAgICAgICAgICAgIFdIRVJFIGlkID0gJDFcclxuICAgICAgICAgIGAsXHJcbiAgICAgICAgICBbaW5wdXQucGF5bWVudElkLCBpbnB1dC5yZWFzb25dXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgaW52VXBkID0gYXdhaXQgY2xpZW50LnF1ZXJ5PHsgaWQ6IG51bWJlciB9PihcclxuICAgICAgICBgXHJcbiAgICAgICAgICBVUERBVEUgaW52b2ljZXNcclxuICAgICAgICAgIFNFVCBzdGF0dXMgPSAkMSwgdXBkYXRlZF9hdCA9IE5PVygpXHJcbiAgICAgICAgICBXSEVSRSBpZCA9ICQyIEFORCBkZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICAgIFJFVFVSTklORyBpZFxyXG4gICAgICAgIGAsXHJcbiAgICAgICAgW2lucHV0Lm5ld0ludm9pY2VTdGF0dXMsIGlucHV0Lmludm9pY2VJZF1cclxuICAgICAgKTtcclxuICAgICAgaWYgKGludlVwZC5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIlJPTExCQUNLXCIpO1xyXG4gICAgICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDQsIFwi0KHRh9GR0YIg0L3QtSDQvdCw0LnQtNC10L1cIik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcclxuICAgICAgICBgXHJcbiAgICAgICAgICBJTlNFUlQgSU5UTyBjYXNoX3JlZ2lzdGVyX2VudHJpZXMgKFxyXG4gICAgICAgICAgICBzaGlmdF9pZCxcclxuICAgICAgICAgICAgcGF5bWVudF9pZCxcclxuICAgICAgICAgICAgdHlwZSxcclxuICAgICAgICAgICAgYW1vdW50LFxyXG4gICAgICAgICAgICBtZXRob2QsXHJcbiAgICAgICAgICAgIG5vdGVcclxuICAgICAgICAgIClcclxuICAgICAgICAgIFZBTFVFUyAoJDEsICQyLCAncmVmdW5kJywgJDMsICQ0LCAkNSlcclxuICAgICAgICBgLFxyXG4gICAgICAgIFtcclxuICAgICAgICAgIGlucHV0LnNoaWZ0SWQsXHJcbiAgICAgICAgICBpbnB1dC5wYXltZW50SWQsXHJcbiAgICAgICAgICBpbnB1dC5yZWZ1bmRBbW91bnQsXHJcbiAgICAgICAgICBpbnB1dC5tZXRob2QsXHJcbiAgICAgICAgICBpbnB1dC5jYXNoTm90ZSxcclxuICAgICAgICBdXHJcbiAgICAgICk7XHJcblxyXG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJDT01NSVRcIik7XHJcbiAgICAgIHJldHVybiB7IGNhc2hXcml0dGVuSW5SZXBvOiB0cnVlIH07XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcclxuICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgLyogaWdub3JlICovXHJcbiAgICAgIH1cclxuICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgY2xpZW50LnJlbGVhc2UoKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19