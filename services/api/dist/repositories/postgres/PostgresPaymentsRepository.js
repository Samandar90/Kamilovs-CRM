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
