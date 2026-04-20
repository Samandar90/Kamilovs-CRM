"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresInvoicesRepository = void 0;
const env_1 = require("../../config/env");
const database_1 = require("../../config/database");
const numbers_1 = require("../../utils/numbers");
/**
 * Ответ PostgreSQL для `timestamptz` — `Date` или строка; ISO в JSON.
 * Невалидные значения → не бросаем RangeError из `toISOString()` на битой строке/Date.
 */
const toIso = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
        return new Date(0).toISOString();
    }
    return d.toISOString();
};
/** Параметры INSERT — только конечные числа (иначе 22P02). */
function bindInvoiceNumeric(field, value) {
    return (0, numbers_1.parseRequiredNumber)(value, field);
}
const num = (v) => (0, numbers_1.parseMoneyColumn)(v, 0);
const paidSubquery = `
  COALESCE(
    (
      SELECT SUM(GREATEST(0::numeric, p.amount - COALESCE(p.refunded_amount, 0)))
      FROM payments p
      WHERE p.invoice_id = invoices.id AND p.deleted_at IS NULL
    ),
    0
  )::numeric AS paid_amount
`;
const mapItemRow = (row) => ({
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    serviceId: row.service_id != null ? Number(row.service_id) : null,
    description: row.description,
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    lineTotal: num(row.line_total),
});
const mapSummaryRow = (row) => ({
    id: Number(row.id),
    number: String(row.number),
    patientId: Number(row.patient_id),
    appointmentId: row.appointment_id != null ? Number(row.appointment_id) : null,
    status: row.status,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    total: num(row.total),
    paidAmount: num(row.paid_amount ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
});
const syntheticItems = (invoiceId, total) => [
    {
        id: 0,
        invoiceId,
        serviceId: null,
        description: "Invoice total",
        quantity: 1,
        unitPrice: total,
        lineTotal: total,
    },
];
async function loadItems(invoiceId) {
    const res = await database_1.dbPool.query(`
      SELECT id, invoice_id, service_id, description, quantity, unit_price, line_total
      FROM invoice_items
      WHERE invoice_id = $1
      ORDER BY id ASC
    `, [invoiceId]);
    return res.rows.map(mapItemRow);
}
async function insertItems(client, invoiceId, items) {
    for (const item of items) {
        await client.query(`
        INSERT INTO invoice_items (
          invoice_id,
          service_id,
          description,
          quantity,
          unit_price,
          line_total
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, (() => {
            const rowValues = [
                invoiceId,
                item.serviceId != null ? bindInvoiceNumeric("invoice_items.service_id", item.serviceId) : null,
                String(item.description ?? ""),
                bindInvoiceNumeric("invoice_items.quantity", item.quantity),
                bindInvoiceNumeric("invoice_items.unit_price", item.unitPrice),
                bindInvoiceNumeric("invoice_items.line_total", item.lineTotal),
            ];
            if (env_1.env.debugInvoiceCreate) {
                // eslint-disable-next-line no-console
                console.log("[PostgresInvoicesRepository.insertItems] VALUES", rowValues);
            }
            return rowValues;
        })());
    }
}
class PostgresInvoicesRepository {
    async findAll(filters = {}) {
        const clauses = ["deleted_at IS NULL"];
        const values = [];
        if (filters.patientId !== undefined) {
            values.push(filters.patientId);
            clauses.push(`patient_id = $${values.length}`);
        }
        if (filters.appointmentId !== undefined) {
            values.push(filters.appointmentId);
            clauses.push(`appointment_id = $${values.length}`);
        }
        if (filters.status !== undefined) {
            values.push(filters.status);
            clauses.push(`status = $${values.length}`);
        }
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          number,
          patient_id,
          appointment_id,
          subtotal,
          discount,
          total,
          status,
          created_at,
          updated_at,
          ${paidSubquery}
        FROM invoices
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
      `, values);
        return result.rows.map(mapSummaryRow);
    }
    async findById(id) {
        const inv = await database_1.dbPool.query(`
        SELECT
          id,
          number,
          patient_id,
          appointment_id,
          subtotal,
          discount,
          total,
          status,
          created_at,
          updated_at,
          ${paidSubquery}
        FROM invoices
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `, [id]);
        if (inv.rows.length === 0) {
            return null;
        }
        const row = inv.rows[0];
        const summary = mapSummaryRow(row);
        let items = await loadItems(Number(row.id));
        if (items.length === 0) {
            items = syntheticItems(Number(row.id), num(row.total));
        }
        return {
            ...summary,
            items,
        };
    }
    async create(input, items) {
        if (items.length === 0) {
            throw new Error("PostgresInvoicesRepository.create: items must not be empty");
        }
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const insertHeaderValues = [
                String(input.number ?? "").trim() || `INV-${Date.now()}`,
                bindInvoiceNumeric("patient_id", input.patientId),
                input.appointmentId == null ? null : bindInvoiceNumeric("appointment_id", input.appointmentId),
                String(input.status ?? "draft"),
                bindInvoiceNumeric("subtotal", input.subtotal),
                bindInvoiceNumeric("discount", input.discount),
                bindInvoiceNumeric("total", input.total),
                bindInvoiceNumeric("paid_amount", input.paidAmount ?? 0),
            ];
            if (env_1.env.debugInvoiceCreate) {
                // eslint-disable-next-line no-console
                console.log("[PostgresInvoicesRepository.create] INSERT invoices VALUES", insertHeaderValues);
            }
            const result = await client.query(`
          INSERT INTO invoices (
            number,
            patient_id,
            appointment_id,
            status,
            subtotal,
            discount,
            total,
            paid_amount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING
            id,
            number,
            patient_id,
            appointment_id,
            subtotal,
            discount,
            total,
            status,
            created_at,
            updated_at
        `, insertHeaderValues);
            const row = result.rows[0];
            const invoiceId = Number(row.id);
            await insertItems(client, invoiceId, items);
            await client.query("COMMIT");
            return mapSummaryRow({ ...row, paid_amount: 0 });
        }
        catch (e) {
            await client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    }
    async update(id, input, replaceLineItems) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query(`SELECT id FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
            if (existing.rows.length === 0) {
                await client.query("ROLLBACK");
                return null;
            }
            const setClauses = ["updated_at = NOW()"];
            const values = [];
            if (input.number !== undefined) {
                values.push(input.number);
                setClauses.push(`number = $${values.length}`);
            }
            if (input.patientId !== undefined) {
                values.push(input.patientId);
                setClauses.push(`patient_id = $${values.length}`);
            }
            if (input.appointmentId !== undefined) {
                values.push(input.appointmentId);
                setClauses.push(`appointment_id = $${values.length}`);
            }
            if (input.status !== undefined) {
                values.push(input.status);
                setClauses.push(`status = $${values.length}`);
            }
            if (input.subtotal !== undefined) {
                values.push(input.subtotal);
                setClauses.push(`subtotal = $${values.length}`);
            }
            if (input.discount !== undefined) {
                values.push(input.discount);
                setClauses.push(`discount = $${values.length}`);
            }
            if (input.total !== undefined) {
                values.push(input.total);
                setClauses.push(`total = $${values.length}`);
            }
            const hasHeaderChanges = setClauses.length > 1 || replaceLineItems !== undefined;
            if (replaceLineItems !== undefined) {
                await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
                if (replaceLineItems.length > 0) {
                    await insertItems(client, id, replaceLineItems);
                }
            }
            if (setClauses.length > 1) {
                values.push(id);
                const upd = await client.query(`
            UPDATE invoices
            SET ${setClauses.join(", ")}
            WHERE id = $${values.length} AND deleted_at IS NULL
            RETURNING id
          `, values);
                if (upd.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return null;
                }
            }
            else if (replaceLineItems !== undefined) {
                values.push(id);
                await client.query(`UPDATE invoices SET updated_at = NOW() WHERE id = $${values.length} AND deleted_at IS NULL`, values);
            }
            else {
                await client.query("ROLLBACK");
                const full = await this.findById(id);
                if (!full)
                    return null;
                const { items: _i, ...summary } = full;
                return summary;
            }
            await client.query("COMMIT");
            const refreshed = await database_1.dbPool.query(`
          SELECT
            id,
            number,
            patient_id,
            appointment_id,
            subtotal,
            discount,
            total,
            status,
            created_at,
            updated_at,
            ${paidSubquery}
          FROM invoices
          WHERE id = $1
        `, [id]);
            if (refreshed.rows.length === 0)
                return null;
            return mapSummaryRow(refreshed.rows[0]);
        }
        catch (e) {
            await client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    }
    async delete(id) {
        const result = await database_1.dbPool.query(`
        UPDATE invoices
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [id]);
        return result.rows.length > 0;
    }
    async replaceItems(invoiceId, items) {
        const client = await database_1.dbPool.connect();
        try {
            await client.query("BEGIN");
            const ex = await client.query(`SELECT id FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [invoiceId]);
            if (ex.rows.length === 0) {
                await client.query("ROLLBACK");
                return;
            }
            await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
            if (items.length > 0) {
                await insertItems(client, invoiceId, items);
            }
            await client.query(`UPDATE invoices SET updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [invoiceId]);
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    }
    async patientExists(pid) {
        const result = await database_1.dbPool.query(`
        SELECT EXISTS(
          SELECT 1 FROM patients WHERE id = $1 AND deleted_at IS NULL
        ) AS exists
      `, [pid]);
        return result.rows[0]?.exists === true;
    }
    async appointmentExists(aid) {
        const result = await database_1.dbPool.query(`
        SELECT EXISTS(
          SELECT 1 FROM appointments WHERE id = $1 AND deleted_at IS NULL
        ) AS exists
      `, [aid]);
        return result.rows[0]?.exists === true;
    }
    async getAppointmentPatientId(appointmentId) {
        const result = await database_1.dbPool.query(`
        SELECT patient_id
        FROM appointments
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `, [appointmentId]);
        if (result.rows.length === 0) {
            return null;
        }
        return Number(result.rows[0].patient_id);
    }
}
exports.PostgresInvoicesRepository = PostgresInvoicesRepository;
