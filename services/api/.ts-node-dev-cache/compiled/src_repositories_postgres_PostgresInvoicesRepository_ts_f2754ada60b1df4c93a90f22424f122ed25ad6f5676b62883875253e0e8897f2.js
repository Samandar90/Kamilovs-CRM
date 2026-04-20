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
            const linePrice = bindInvoiceNumeric("invoice_items.unit_price", item.unitPrice);
            const rowValues = [
                invoiceId,
                item.serviceId != null ? bindInvoiceNumeric("invoice_items.service_id", item.serviceId) : null,
                String(item.description ?? ""),
                1,
                linePrice,
                linePrice,
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvcmVwb3NpdG9yaWVzL3Bvc3RncmVzL1Bvc3RncmVzSW52b2ljZXNSZXBvc2l0b3J5LnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9yZXBvc2l0b3JpZXMvcG9zdGdyZXMvUG9zdGdyZXNJbnZvaWNlc1JlcG9zaXRvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBV0EsMENBQXVDO0FBQ3ZDLG9EQUErQztBQUMvQyxpREFBNEU7QUEwQjVFOzs7R0FHRztBQUNILE1BQU0sS0FBSyxHQUFHLENBQUMsS0FBb0IsRUFBVSxFQUFFO0lBQzdDLE1BQU0sQ0FBQyxHQUFHLEtBQUssWUFBWSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUQsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDOUIsT0FBTyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBQ0QsT0FBTyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7QUFDekIsQ0FBQyxDQUFDO0FBRUYsOERBQThEO0FBQzlELFNBQVMsa0JBQWtCLENBQUMsS0FBYSxFQUFFLEtBQWM7SUFDdkQsT0FBTyxJQUFBLDZCQUFtQixFQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBRUQsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFrQixFQUFVLEVBQUUsQ0FBQyxJQUFBLDBCQUFnQixFQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUVuRSxNQUFNLFlBQVksR0FBRzs7Ozs7Ozs7O0NBU3BCLENBQUM7QUFFRixNQUFNLFVBQVUsR0FB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QUFDLENBQUM7SUFDM0MsQ0FBQztDQUNGO0FBMVZELGdFQTBWQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSUludm9pY2VzUmVwb3NpdG9yeSB9IGZyb20gXCIuLi9pbnRlcmZhY2VzL0lJbnZvaWNlc1JlcG9zaXRvcnlcIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIEludm9pY2UsXHJcbiAgSW52b2ljZUNyZWF0ZUlucHV0LFxyXG4gIEludm9pY2VGaWx0ZXJzLFxyXG4gIEludm9pY2VJdGVtLFxyXG4gIEludm9pY2VJdGVtSW5wdXQsXHJcbiAgSW52b2ljZVN0YXR1cyxcclxuICBJbnZvaWNlU3VtbWFyeSxcclxuICBJbnZvaWNlVXBkYXRlSW5wdXQsXHJcbn0gZnJvbSBcIi4uL2ludGVyZmFjZXMvYmlsbGluZ1R5cGVzXCI7XHJcbmltcG9ydCB7IGVudiB9IGZyb20gXCIuLi8uLi9jb25maWcvZW52XCI7XHJcbmltcG9ydCB7IGRiUG9vbCB9IGZyb20gXCIuLi8uLi9jb25maWcvZGF0YWJhc2VcIjtcclxuaW1wb3J0IHsgcGFyc2VNb25leUNvbHVtbiwgcGFyc2VSZXF1aXJlZE51bWJlciB9IGZyb20gXCIuLi8uLi91dGlscy9udW1iZXJzXCI7XHJcblxyXG50eXBlIEludm9pY2VSb3cgPSB7XHJcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcclxuICBudW1iZXI6IHN0cmluZztcclxuICBwYXRpZW50X2lkOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgYXBwb2ludG1lbnRfaWQ6IHN0cmluZyB8IG51bWJlciB8IG51bGw7XHJcbiAgc3VidG90YWw6IHN0cmluZyB8IG51bWJlcjtcclxuICBkaXNjb3VudDogc3RyaW5nIHwgbnVtYmVyO1xyXG4gIHRvdGFsOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgc3RhdHVzOiBJbnZvaWNlU3RhdHVzO1xyXG4gIGNyZWF0ZWRfYXQ6IERhdGUgfCBzdHJpbmc7XHJcbiAgdXBkYXRlZF9hdDogRGF0ZSB8IHN0cmluZztcclxuICBwYWlkX2Ftb3VudD86IHN0cmluZyB8IG51bWJlcjtcclxufTtcclxuXHJcbnR5cGUgSW52b2ljZUl0ZW1Sb3cgPSB7XHJcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcclxuICBpbnZvaWNlX2lkOiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgc2VydmljZV9pZDogc3RyaW5nIHwgbnVtYmVyIHwgbnVsbDtcclxuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xyXG4gIHF1YW50aXR5OiBzdHJpbmcgfCBudW1iZXI7XHJcbiAgdW5pdF9wcmljZTogc3RyaW5nIHwgbnVtYmVyO1xyXG4gIGxpbmVfdG90YWw6IHN0cmluZyB8IG51bWJlcjtcclxufTtcclxuXHJcbi8qKlxyXG4gKiDQntGC0LLQtdGCIFBvc3RncmVTUUwg0LTQu9GPIGB0aW1lc3RhbXB0emAg4oCUIGBEYXRlYCDQuNC70Lgg0YHRgtGA0L7QutCwOyBJU08g0LIgSlNPTi5cclxuICog0J3QtdCy0LDQu9C40LTQvdGL0LUg0LfQvdCw0YfQtdC90LjRjyDihpIg0L3QtSDQsdGA0L7RgdCw0LXQvCBSYW5nZUVycm9yINC40LcgYHRvSVNPU3RyaW5nKClgINC90LAg0LHQuNGC0L7QuSDRgdGC0YDQvtC60LUvRGF0ZS5cclxuICovXHJcbmNvbnN0IHRvSXNvID0gKHZhbHVlOiBEYXRlIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcclxuICBjb25zdCBkID0gdmFsdWUgaW5zdGFuY2VvZiBEYXRlID8gdmFsdWUgOiBuZXcgRGF0ZSh2YWx1ZSk7XHJcbiAgaWYgKE51bWJlci5pc05hTihkLmdldFRpbWUoKSkpIHtcclxuICAgIHJldHVybiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpO1xyXG4gIH1cclxuICByZXR1cm4gZC50b0lTT1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqINCf0LDRgNCw0LzQtdGC0YDRiyBJTlNFUlQg4oCUINGC0L7Qu9GM0LrQviDQutC+0L3QtdGH0L3Ri9C1INGH0LjRgdC70LAgKNC40L3QsNGH0LUgMjJQMDIpLiAqL1xyXG5mdW5jdGlvbiBiaW5kSW52b2ljZU51bWVyaWMoZmllbGQ6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBudW1iZXIge1xyXG4gIHJldHVybiBwYXJzZVJlcXVpcmVkTnVtYmVyKHZhbHVlLCBmaWVsZCk7XHJcbn1cclxuXHJcbmNvbnN0IG51bSA9ICh2OiBzdHJpbmcgfCBudW1iZXIpOiBudW1iZXIgPT4gcGFyc2VNb25leUNvbHVtbih2LCAwKTtcclxuXHJcbmNvbnN0IHBhaWRTdWJxdWVyeSA9IGBcclxuICBDT0FMRVNDRShcclxuICAgIChcclxuICAgICAgU0VMRUNUIFNVTShHUkVBVEVTVCgwOjpudW1lcmljLCBwLmFtb3VudCAtIENPQUxFU0NFKHAucmVmdW5kZWRfYW1vdW50LCAwKSkpXHJcbiAgICAgIEZST00gcGF5bWVudHMgcFxyXG4gICAgICBXSEVSRSBwLmludm9pY2VfaWQgPSBpbnZvaWNlcy5pZCBBTkQgcC5kZWxldGVkX2F0IElTIE5VTExcclxuICAgICksXHJcbiAgICAwXHJcbiAgKTo6bnVtZXJpYyBBUyBwYWlkX2Ftb3VudFxyXG5gO1xyXG5cclxuY29uc3QgbWFwSXRlbVJvdyA9IChyb3c6IEludm9pY2VJdGVtUm93KTogSW52b2ljZUl0ZW0gPT4gKHtcclxuICBpZDogTnVtYmVyKHJvdy5pZCksXHJcbiAgaW52b2ljZUlkOiBOdW1iZXIocm93Lmludm9pY2VfaWQpLFxyXG4gIHNlcnZpY2VJZDogcm93LnNlcnZpY2VfaWQgIT0gbnVsbCA/IE51bWJlcihyb3cuc2VydmljZV9pZCkgOiBudWxsLFxyXG4gIGRlc2NyaXB0aW9uOiByb3cuZGVzY3JpcHRpb24sXHJcbiAgcXVhbnRpdHk6IG51bShyb3cucXVhbnRpdHkpLFxyXG4gIHVuaXRQcmljZTogbnVtKHJvdy51bml0X3ByaWNlKSxcclxuICBsaW5lVG90YWw6IG51bShyb3cubGluZV90b3RhbCksXHJcbn0pO1xyXG5cclxuY29uc3QgbWFwU3VtbWFyeVJvdyA9IChyb3c6IEludm9pY2VSb3cpOiBJbnZvaWNlU3VtbWFyeSA9PiAoe1xyXG4gIGlkOiBOdW1iZXIocm93LmlkKSxcclxuICBudW1iZXI6IFN0cmluZyhyb3cubnVtYmVyKSxcclxuICBwYXRpZW50SWQ6IE51bWJlcihyb3cucGF0aWVudF9pZCksXHJcbiAgYXBwb2ludG1lbnRJZDogcm93LmFwcG9pbnRtZW50X2lkICE9IG51bGwgPyBOdW1iZXIocm93LmFwcG9pbnRtZW50X2lkKSA6IG51bGwsXHJcbiAgc3RhdHVzOiByb3cuc3RhdHVzLFxyXG4gIHN1YnRvdGFsOiBudW0ocm93LnN1YnRvdGFsKSxcclxuICBkaXNjb3VudDogbnVtKHJvdy5kaXNjb3VudCksXHJcbiAgdG90YWw6IG51bShyb3cudG90YWwpLFxyXG4gIHBhaWRBbW91bnQ6IG51bShyb3cucGFpZF9hbW91bnQgPz8gMCksXHJcbiAgY3JlYXRlZEF0OiB0b0lzbyhyb3cuY3JlYXRlZF9hdCksXHJcbiAgdXBkYXRlZEF0OiB0b0lzbyhyb3cudXBkYXRlZF9hdCksXHJcbn0pO1xyXG5cclxuY29uc3Qgc3ludGhldGljSXRlbXMgPSAoaW52b2ljZUlkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpOiBJbnZvaWNlSXRlbVtdID0+IFtcclxuICB7XHJcbiAgICBpZDogMCxcclxuICAgIGludm9pY2VJZCxcclxuICAgIHNlcnZpY2VJZDogbnVsbCxcclxuICAgIGRlc2NyaXB0aW9uOiBcIkludm9pY2UgdG90YWxcIixcclxuICAgIHF1YW50aXR5OiAxLFxyXG4gICAgdW5pdFByaWNlOiB0b3RhbCxcclxuICAgIGxpbmVUb3RhbDogdG90YWwsXHJcbiAgfSxcclxuXTtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRJdGVtcyhpbnZvaWNlSWQ6IG51bWJlcik6IFByb21pc2U8SW52b2ljZUl0ZW1bXT4ge1xyXG4gIGNvbnN0IHJlcyA9IGF3YWl0IGRiUG9vbC5xdWVyeTxJbnZvaWNlSXRlbVJvdz4oXHJcbiAgICBgXHJcbiAgICAgIFNFTEVDVCBpZCwgaW52b2ljZV9pZCwgc2VydmljZV9pZCwgZGVzY3JpcHRpb24sIHF1YW50aXR5LCB1bml0X3ByaWNlLCBsaW5lX3RvdGFsXHJcbiAgICAgIEZST00gaW52b2ljZV9pdGVtc1xyXG4gICAgICBXSEVSRSBpbnZvaWNlX2lkID0gJDFcclxuICAgICAgT1JERVIgQlkgaWQgQVNDXHJcbiAgICBgLFxyXG4gICAgW2ludm9pY2VJZF1cclxuICApO1xyXG4gIHJldHVybiByZXMucm93cy5tYXAobWFwSXRlbVJvdyk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGluc2VydEl0ZW1zKFxyXG4gIGNsaWVudDogeyBxdWVyeTogdHlwZW9mIGRiUG9vbC5xdWVyeSB9LFxyXG4gIGludm9pY2VJZDogbnVtYmVyLFxyXG4gIGl0ZW1zOiBJbnZvaWNlSXRlbUlucHV0W11cclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XHJcbiAgICBhd2FpdCBjbGllbnQucXVlcnkoXHJcbiAgICAgIGBcclxuICAgICAgICBJTlNFUlQgSU5UTyBpbnZvaWNlX2l0ZW1zIChcclxuICAgICAgICAgIGludm9pY2VfaWQsXHJcbiAgICAgICAgICBzZXJ2aWNlX2lkLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICBxdWFudGl0eSxcclxuICAgICAgICAgIHVuaXRfcHJpY2UsXHJcbiAgICAgICAgICBsaW5lX3RvdGFsXHJcbiAgICAgICAgKVxyXG4gICAgICAgIFZBTFVFUyAoJDEsICQyLCAkMywgJDQsICQ1LCAkNilcclxuICAgICAgYCxcclxuICAgICAgKCgpID0+IHtcclxuICAgICAgICBjb25zdCBsaW5lUHJpY2UgPSBiaW5kSW52b2ljZU51bWVyaWMoXCJpbnZvaWNlX2l0ZW1zLnVuaXRfcHJpY2VcIiwgaXRlbS51bml0UHJpY2UpO1xyXG4gICAgICAgIGNvbnN0IHJvd1ZhbHVlczogKHN0cmluZyB8IG51bWJlciB8IG51bGwpW10gPSBbXHJcbiAgICAgICAgICBpbnZvaWNlSWQsXHJcbiAgICAgICAgICBpdGVtLnNlcnZpY2VJZCAhPSBudWxsID8gYmluZEludm9pY2VOdW1lcmljKFwiaW52b2ljZV9pdGVtcy5zZXJ2aWNlX2lkXCIsIGl0ZW0uc2VydmljZUlkKSA6IG51bGwsXHJcbiAgICAgICAgICBTdHJpbmcoaXRlbS5kZXNjcmlwdGlvbiA/PyBcIlwiKSxcclxuICAgICAgICAgIDEsXHJcbiAgICAgICAgICBsaW5lUHJpY2UsXHJcbiAgICAgICAgICBsaW5lUHJpY2UsXHJcbiAgICAgICAgXTtcclxuICAgICAgICBpZiAoZW52LmRlYnVnSW52b2ljZUNyZWF0ZSkge1xyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgICAgIGNvbnNvbGUubG9nKFwiW1Bvc3RncmVzSW52b2ljZXNSZXBvc2l0b3J5Lmluc2VydEl0ZW1zXSBWQUxVRVNcIiwgcm93VmFsdWVzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJvd1ZhbHVlcztcclxuICAgICAgfSkoKVxyXG4gICAgKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc0ludm9pY2VzUmVwb3NpdG9yeSBpbXBsZW1lbnRzIElJbnZvaWNlc1JlcG9zaXRvcnkge1xyXG4gIGFzeW5jIGZpbmRBbGwoZmlsdGVyczogSW52b2ljZUZpbHRlcnMgPSB7fSk6IFByb21pc2U8SW52b2ljZVN1bW1hcnlbXT4ge1xyXG4gICAgY29uc3QgY2xhdXNlczogc3RyaW5nW10gPSBbXCJkZWxldGVkX2F0IElTIE5VTExcIl07XHJcbiAgICBjb25zdCB2YWx1ZXM6IEFycmF5PG51bWJlciB8IHN0cmluZz4gPSBbXTtcclxuXHJcbiAgICBpZiAoZmlsdGVycy5wYXRpZW50SWQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB2YWx1ZXMucHVzaChmaWx0ZXJzLnBhdGllbnRJZCk7XHJcbiAgICAgIGNsYXVzZXMucHVzaChgcGF0aWVudF9pZCA9ICQke3ZhbHVlcy5sZW5ndGh9YCk7XHJcbiAgICB9XHJcbiAgICBpZiAoZmlsdGVycy5hcHBvaW50bWVudElkICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdmFsdWVzLnB1c2goZmlsdGVycy5hcHBvaW50bWVudElkKTtcclxuICAgICAgY2xhdXNlcy5wdXNoKGBhcHBvaW50bWVudF9pZCA9ICQke3ZhbHVlcy5sZW5ndGh9YCk7XHJcbiAgICB9XHJcbiAgICBpZiAoZmlsdGVycy5zdGF0dXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB2YWx1ZXMucHVzaChmaWx0ZXJzLnN0YXR1cyk7XHJcbiAgICAgIGNsYXVzZXMucHVzaChgc3RhdHVzID0gJCR7dmFsdWVzLmxlbmd0aH1gKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8SW52b2ljZVJvdz4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIGlkLFxyXG4gICAgICAgICAgbnVtYmVyLFxyXG4gICAgICAgICAgcGF0aWVudF9pZCxcclxuICAgICAgICAgIGFwcG9pbnRtZW50X2lkLFxyXG4gICAgICAgICAgc3VidG90YWwsXHJcbiAgICAgICAgICBkaXNjb3VudCxcclxuICAgICAgICAgIHRvdGFsLFxyXG4gICAgICAgICAgc3RhdHVzLFxyXG4gICAgICAgICAgY3JlYXRlZF9hdCxcclxuICAgICAgICAgIHVwZGF0ZWRfYXQsXHJcbiAgICAgICAgICAke3BhaWRTdWJxdWVyeX1cclxuICAgICAgICBGUk9NIGludm9pY2VzXHJcbiAgICAgICAgV0hFUkUgJHtjbGF1c2VzLmpvaW4oXCIgQU5EIFwiKX1cclxuICAgICAgICBPUkRFUiBCWSBjcmVhdGVkX2F0IERFU0NcclxuICAgICAgYCxcclxuICAgICAgdmFsdWVzXHJcbiAgICApO1xyXG4gICAgcmV0dXJuIHJlc3VsdC5yb3dzLm1hcChtYXBTdW1tYXJ5Um93KTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGZpbmRCeUlkKGlkOiBudW1iZXIpOiBQcm9taXNlPEludm9pY2UgfCBudWxsPiB7XHJcbiAgICBjb25zdCBpbnYgPSBhd2FpdCBkYlBvb2wucXVlcnk8SW52b2ljZVJvdz4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1RcclxuICAgICAgICAgIGlkLFxyXG4gICAgICAgICAgbnVtYmVyLFxyXG4gICAgICAgICAgcGF0aWVudF9pZCxcclxuICAgICAgICAgIGFwcG9pbnRtZW50X2lkLFxyXG4gICAgICAgICAgc3VidG90YWwsXHJcbiAgICAgICAgICBkaXNjb3VudCxcclxuICAgICAgICAgIHRvdGFsLFxyXG4gICAgICAgICAgc3RhdHVzLFxyXG4gICAgICAgICAgY3JlYXRlZF9hdCxcclxuICAgICAgICAgIHVwZGF0ZWRfYXQsXHJcbiAgICAgICAgICAke3BhaWRTdWJxdWVyeX1cclxuICAgICAgICBGUk9NIGludm9pY2VzXHJcbiAgICAgICAgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgTElNSVQgMVxyXG4gICAgICBgLFxyXG4gICAgICBbaWRdXHJcbiAgICApO1xyXG4gICAgaWYgKGludi5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb3cgPSBpbnYucm93c1swXTtcclxuICAgIGNvbnN0IHN1bW1hcnkgPSBtYXBTdW1tYXJ5Um93KHJvdyk7XHJcbiAgICBsZXQgaXRlbXMgPSBhd2FpdCBsb2FkSXRlbXMoTnVtYmVyKHJvdy5pZCkpO1xyXG4gICAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBpdGVtcyA9IHN5bnRoZXRpY0l0ZW1zKE51bWJlcihyb3cuaWQpLCBudW0ocm93LnRvdGFsKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgLi4uc3VtbWFyeSxcclxuICAgICAgaXRlbXMsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgY3JlYXRlKGlucHV0OiBJbnZvaWNlQ3JlYXRlSW5wdXQsIGl0ZW1zOiBJbnZvaWNlSXRlbUlucHV0W10pOiBQcm9taXNlPEludm9pY2VTdW1tYXJ5PiB7XHJcbiAgICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlBvc3RncmVzSW52b2ljZXNSZXBvc2l0b3J5LmNyZWF0ZTogaXRlbXMgbXVzdCBub3QgYmUgZW1wdHlcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgZGJQb29sLmNvbm5lY3QoKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkJFR0lOXCIpO1xyXG5cclxuICAgICAgY29uc3QgaW5zZXJ0SGVhZGVyVmFsdWVzOiAoc3RyaW5nIHwgbnVtYmVyIHwgbnVsbClbXSA9IFtcclxuICAgICAgICBTdHJpbmcoaW5wdXQubnVtYmVyID8/IFwiXCIpLnRyaW0oKSB8fCBgSU5WLSR7RGF0ZS5ub3coKX1gLFxyXG4gICAgICAgIGJpbmRJbnZvaWNlTnVtZXJpYyhcInBhdGllbnRfaWRcIiwgaW5wdXQucGF0aWVudElkKSxcclxuICAgICAgICBpbnB1dC5hcHBvaW50bWVudElkID09IG51bGwgPyBudWxsIDogYmluZEludm9pY2VOdW1lcmljKFwiYXBwb2ludG1lbnRfaWRcIiwgaW5wdXQuYXBwb2ludG1lbnRJZCksXHJcbiAgICAgICAgU3RyaW5nKGlucHV0LnN0YXR1cyA/PyBcImRyYWZ0XCIpLFxyXG4gICAgICAgIGJpbmRJbnZvaWNlTnVtZXJpYyhcInN1YnRvdGFsXCIsIGlucHV0LnN1YnRvdGFsKSxcclxuICAgICAgICBiaW5kSW52b2ljZU51bWVyaWMoXCJkaXNjb3VudFwiLCBpbnB1dC5kaXNjb3VudCksXHJcbiAgICAgICAgYmluZEludm9pY2VOdW1lcmljKFwidG90YWxcIiwgaW5wdXQudG90YWwpLFxyXG4gICAgICAgIGJpbmRJbnZvaWNlTnVtZXJpYyhcInBhaWRfYW1vdW50XCIsIGlucHV0LnBhaWRBbW91bnQgPz8gMCksXHJcbiAgICAgIF07XHJcbiAgICAgIGlmIChlbnYuZGVidWdJbnZvaWNlQ3JlYXRlKSB7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgICBjb25zb2xlLmxvZyhcIltQb3N0Z3Jlc0ludm9pY2VzUmVwb3NpdG9yeS5jcmVhdGVdIElOU0VSVCBpbnZvaWNlcyBWQUxVRVNcIiwgaW5zZXJ0SGVhZGVyVmFsdWVzKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LnF1ZXJ5PE9taXQ8SW52b2ljZVJvdywgXCJwYWlkX2Ftb3VudFwiPj4oXHJcbiAgICAgICAgYFxyXG4gICAgICAgICAgSU5TRVJUIElOVE8gaW52b2ljZXMgKFxyXG4gICAgICAgICAgICBudW1iZXIsXHJcbiAgICAgICAgICAgIHBhdGllbnRfaWQsXHJcbiAgICAgICAgICAgIGFwcG9pbnRtZW50X2lkLFxyXG4gICAgICAgICAgICBzdGF0dXMsXHJcbiAgICAgICAgICAgIHN1YnRvdGFsLFxyXG4gICAgICAgICAgICBkaXNjb3VudCxcclxuICAgICAgICAgICAgdG90YWwsXHJcbiAgICAgICAgICAgIHBhaWRfYW1vdW50XHJcbiAgICAgICAgICApXHJcbiAgICAgICAgICBWQUxVRVMgKCQxLCAkMiwgJDMsICQ0LCAkNSwgJDYsICQ3LCAkOClcclxuICAgICAgICAgIFJFVFVSTklOR1xyXG4gICAgICAgICAgICBpZCxcclxuICAgICAgICAgICAgbnVtYmVyLFxyXG4gICAgICAgICAgICBwYXRpZW50X2lkLFxyXG4gICAgICAgICAgICBhcHBvaW50bWVudF9pZCxcclxuICAgICAgICAgICAgc3VidG90YWwsXHJcbiAgICAgICAgICAgIGRpc2NvdW50LFxyXG4gICAgICAgICAgICB0b3RhbCxcclxuICAgICAgICAgICAgc3RhdHVzLFxyXG4gICAgICAgICAgICBjcmVhdGVkX2F0LFxyXG4gICAgICAgICAgICB1cGRhdGVkX2F0XHJcbiAgICAgICAgYCxcclxuICAgICAgICBpbnNlcnRIZWFkZXJWYWx1ZXNcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGNvbnN0IHJvdyA9IHJlc3VsdC5yb3dzWzBdO1xyXG4gICAgICBjb25zdCBpbnZvaWNlSWQgPSBOdW1iZXIocm93LmlkKTtcclxuICAgICAgYXdhaXQgaW5zZXJ0SXRlbXMoY2xpZW50LCBpbnZvaWNlSWQsIGl0ZW1zKTtcclxuXHJcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcclxuXHJcbiAgICAgIHJldHVybiBtYXBTdW1tYXJ5Um93KHsgLi4ucm93LCBwYWlkX2Ftb3VudDogMCB9KTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgIHRocm93IGU7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgdXBkYXRlKFxyXG4gICAgaWQ6IG51bWJlcixcclxuICAgIGlucHV0OiBJbnZvaWNlVXBkYXRlSW5wdXQsXHJcbiAgICByZXBsYWNlTGluZUl0ZW1zPzogSW52b2ljZUl0ZW1JbnB1dFtdXHJcbiAgKTogUHJvbWlzZTxJbnZvaWNlU3VtbWFyeSB8IG51bGw+IHtcclxuICAgIGNvbnN0IGNsaWVudCA9IGF3YWl0IGRiUG9vbC5jb25uZWN0KCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJCRUdJTlwiKTtcclxuXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgY2xpZW50LnF1ZXJ5PHsgaWQ6IHN0cmluZyB8IG51bWJlciB9PihcclxuICAgICAgICBgU0VMRUNUIGlkIEZST00gaW52b2ljZXMgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMIEZPUiBVUERBVEVgLFxyXG4gICAgICAgIFtpZF1cclxuICAgICAgKTtcclxuICAgICAgaWYgKGV4aXN0aW5nLnJvd3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHNldENsYXVzZXM6IHN0cmluZ1tdID0gW1widXBkYXRlZF9hdCA9IE5PVygpXCJdO1xyXG4gICAgICBjb25zdCB2YWx1ZXM6IEFycmF5PHN0cmluZyB8IG51bWJlciB8IG51bGw+ID0gW107XHJcblxyXG4gICAgICBpZiAoaW5wdXQubnVtYmVyICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICB2YWx1ZXMucHVzaChpbnB1dC5udW1iZXIpO1xyXG4gICAgICAgIHNldENsYXVzZXMucHVzaChgbnVtYmVyID0gJCR7dmFsdWVzLmxlbmd0aH1gKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoaW5wdXQucGF0aWVudElkICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICB2YWx1ZXMucHVzaChpbnB1dC5wYXRpZW50SWQpO1xyXG4gICAgICAgIHNldENsYXVzZXMucHVzaChgcGF0aWVudF9pZCA9ICQke3ZhbHVlcy5sZW5ndGh9YCk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGlucHV0LmFwcG9pbnRtZW50SWQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHZhbHVlcy5wdXNoKGlucHV0LmFwcG9pbnRtZW50SWQpO1xyXG4gICAgICAgIHNldENsYXVzZXMucHVzaChgYXBwb2ludG1lbnRfaWQgPSAkJHt2YWx1ZXMubGVuZ3RofWApO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChpbnB1dC5zdGF0dXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHZhbHVlcy5wdXNoKGlucHV0LnN0YXR1cyk7XHJcbiAgICAgICAgc2V0Q2xhdXNlcy5wdXNoKGBzdGF0dXMgPSAkJHt2YWx1ZXMubGVuZ3RofWApO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChpbnB1dC5zdWJ0b3RhbCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goaW5wdXQuc3VidG90YWwpO1xyXG4gICAgICAgIHNldENsYXVzZXMucHVzaChgc3VidG90YWwgPSAkJHt2YWx1ZXMubGVuZ3RofWApO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChpbnB1dC5kaXNjb3VudCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goaW5wdXQuZGlzY291bnQpO1xyXG4gICAgICAgIHNldENsYXVzZXMucHVzaChgZGlzY291bnQgPSAkJHt2YWx1ZXMubGVuZ3RofWApO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChpbnB1dC50b3RhbCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goaW5wdXQudG90YWwpO1xyXG4gICAgICAgIHNldENsYXVzZXMucHVzaChgdG90YWwgPSAkJHt2YWx1ZXMubGVuZ3RofWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBoYXNIZWFkZXJDaGFuZ2VzID0gc2V0Q2xhdXNlcy5sZW5ndGggPiAxIHx8IHJlcGxhY2VMaW5lSXRlbXMgIT09IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgIGlmIChyZXBsYWNlTGluZUl0ZW1zICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoYERFTEVURSBGUk9NIGludm9pY2VfaXRlbXMgV0hFUkUgaW52b2ljZV9pZCA9ICQxYCwgW2lkXSk7XHJcbiAgICAgICAgaWYgKHJlcGxhY2VMaW5lSXRlbXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgYXdhaXQgaW5zZXJ0SXRlbXMoY2xpZW50LCBpZCwgcmVwbGFjZUxpbmVJdGVtcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoc2V0Q2xhdXNlcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goaWQpO1xyXG4gICAgICAgIGNvbnN0IHVwZCA9IGF3YWl0IGNsaWVudC5xdWVyeTx7IGlkOiBudW1iZXIgfT4oXHJcbiAgICAgICAgICBgXHJcbiAgICAgICAgICAgIFVQREFURSBpbnZvaWNlc1xyXG4gICAgICAgICAgICBTRVQgJHtzZXRDbGF1c2VzLmpvaW4oXCIsIFwiKX1cclxuICAgICAgICAgICAgV0hFUkUgaWQgPSAkJHt2YWx1ZXMubGVuZ3RofSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgICAgIFJFVFVSTklORyBpZFxyXG4gICAgICAgICAgYCxcclxuICAgICAgICAgIHZhbHVlc1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgaWYgKHVwZC5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAocmVwbGFjZUxpbmVJdGVtcyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdmFsdWVzLnB1c2goaWQpO1xyXG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcclxuICAgICAgICAgIGBVUERBVEUgaW52b2ljZXMgU0VUIHVwZGF0ZWRfYXQgPSBOT1coKSBXSEVSRSBpZCA9ICQke3ZhbHVlcy5sZW5ndGh9IEFORCBkZWxldGVkX2F0IElTIE5VTExgLFxyXG4gICAgICAgICAgdmFsdWVzXHJcbiAgICAgICAgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoXCJST0xMQkFDS1wiKTtcclxuICAgICAgICBjb25zdCBmdWxsID0gYXdhaXQgdGhpcy5maW5kQnlJZChpZCk7XHJcbiAgICAgICAgaWYgKCFmdWxsKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCB7IGl0ZW1zOiBfaSwgLi4uc3VtbWFyeSB9ID0gZnVsbDtcclxuICAgICAgICByZXR1cm4gc3VtbWFyeTtcclxuICAgICAgfVxyXG5cclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiQ09NTUlUXCIpO1xyXG5cclxuICAgICAgY29uc3QgcmVmcmVzaGVkID0gYXdhaXQgZGJQb29sLnF1ZXJ5PEludm9pY2VSb3c+KFxyXG4gICAgICAgIGBcclxuICAgICAgICAgIFNFTEVDVFxyXG4gICAgICAgICAgICBpZCxcclxuICAgICAgICAgICAgbnVtYmVyLFxyXG4gICAgICAgICAgICBwYXRpZW50X2lkLFxyXG4gICAgICAgICAgICBhcHBvaW50bWVudF9pZCxcclxuICAgICAgICAgICAgc3VidG90YWwsXHJcbiAgICAgICAgICAgIGRpc2NvdW50LFxyXG4gICAgICAgICAgICB0b3RhbCxcclxuICAgICAgICAgICAgc3RhdHVzLFxyXG4gICAgICAgICAgICBjcmVhdGVkX2F0LFxyXG4gICAgICAgICAgICB1cGRhdGVkX2F0LFxyXG4gICAgICAgICAgICAke3BhaWRTdWJxdWVyeX1cclxuICAgICAgICAgIEZST00gaW52b2ljZXNcclxuICAgICAgICAgIFdIRVJFIGlkID0gJDFcclxuICAgICAgICBgLFxyXG4gICAgICAgIFtpZF1cclxuICAgICAgKTtcclxuICAgICAgaWYgKHJlZnJlc2hlZC5yb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICAgIHJldHVybiBtYXBTdW1tYXJ5Um93KHJlZnJlc2hlZC5yb3dzWzBdKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgIHRocm93IGU7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZGVsZXRlKGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiUG9vbC5xdWVyeTx7IGlkOiBudW1iZXIgfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBVUERBVEUgaW52b2ljZXNcclxuICAgICAgICBTRVQgZGVsZXRlZF9hdCA9IE5PVygpLCB1cGRhdGVkX2F0ID0gTk9XKClcclxuICAgICAgICBXSEVSRSBpZCA9ICQxIEFORCBkZWxldGVkX2F0IElTIE5VTExcclxuICAgICAgICBSRVRVUk5JTkcgaWRcclxuICAgICAgYCxcclxuICAgICAgW2lkXVxyXG4gICAgKTtcclxuICAgIHJldHVybiByZXN1bHQucm93cy5sZW5ndGggPiAwO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgcmVwbGFjZUl0ZW1zKGludm9pY2VJZDogbnVtYmVyLCBpdGVtczogSW52b2ljZUl0ZW1JbnB1dFtdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCBkYlBvb2wuY29ubmVjdCgpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiQkVHSU5cIik7XHJcbiAgICAgIGNvbnN0IGV4ID0gYXdhaXQgY2xpZW50LnF1ZXJ5PHsgaWQ6IG51bWJlciB9PihcclxuICAgICAgICBgU0VMRUNUIGlkIEZST00gaW52b2ljZXMgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMIEZPUiBVUERBVEVgLFxyXG4gICAgICAgIFtpbnZvaWNlSWRdXHJcbiAgICAgICk7XHJcbiAgICAgIGlmIChleC5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIlJPTExCQUNLXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoYERFTEVURSBGUk9NIGludm9pY2VfaXRlbXMgV0hFUkUgaW52b2ljZV9pZCA9ICQxYCwgW2ludm9pY2VJZF0pO1xyXG4gICAgICBpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGF3YWl0IGluc2VydEl0ZW1zKGNsaWVudCwgaW52b2ljZUlkLCBpdGVtcyk7XHJcbiAgICAgIH1cclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFxyXG4gICAgICAgIGBVUERBVEUgaW52b2ljZXMgU0VUIHVwZGF0ZWRfYXQgPSBOT1coKSBXSEVSRSBpZCA9ICQxIEFORCBkZWxldGVkX2F0IElTIE5VTExgLFxyXG4gICAgICAgIFtpbnZvaWNlSWRdXHJcbiAgICAgICk7XHJcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShcIkNPTU1JVFwiKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KFwiUk9MTEJBQ0tcIik7XHJcbiAgICAgIHRocm93IGU7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgcGF0aWVudEV4aXN0cyhwaWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGJQb29sLnF1ZXJ5PHsgZXhpc3RzOiBib29sZWFuIH0+KFxyXG4gICAgICBgXHJcbiAgICAgICAgU0VMRUNUIEVYSVNUUyhcclxuICAgICAgICAgIFNFTEVDVCAxIEZST00gcGF0aWVudHMgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgKSBBUyBleGlzdHNcclxuICAgICAgYCxcclxuICAgICAgW3BpZF1cclxuICAgICk7XHJcbiAgICByZXR1cm4gcmVzdWx0LnJvd3NbMF0/LmV4aXN0cyA9PT0gdHJ1ZTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGFwcG9pbnRtZW50RXhpc3RzKGFpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYlBvb2wucXVlcnk8eyBleGlzdHM6IGJvb2xlYW4gfT4oXHJcbiAgICAgIGBcclxuICAgICAgICBTRUxFQ1QgRVhJU1RTKFxyXG4gICAgICAgICAgU0VMRUNUIDEgRlJPTSBhcHBvaW50bWVudHMgV0hFUkUgaWQgPSAkMSBBTkQgZGVsZXRlZF9hdCBJUyBOVUxMXHJcbiAgICAgICAgKSBBUyBleGlzdHNcclxuICAgICAgYCxcclxuICAgICAgW2FpZF1cclxuICAgICk7XHJcbiAgICByZXR1cm4gcmVzdWx0LnJvd3NbMF0/LmV4aXN0cyA9PT0gdHJ1ZTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldEFwcG9pbnRtZW50UGF0aWVudElkKGFwcG9pbnRtZW50SWQ6IG51bWJlcik6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGJQb29sLnF1ZXJ5PHsgcGF0aWVudF9pZDogc3RyaW5nIHwgbnVtYmVyIH0+KFxyXG4gICAgICBgXHJcbiAgICAgICAgU0VMRUNUIHBhdGllbnRfaWRcclxuICAgICAgICBGUk9NIGFwcG9pbnRtZW50c1xyXG4gICAgICAgIFdIRVJFIGlkID0gJDEgQU5EIGRlbGV0ZWRfYXQgSVMgTlVMTFxyXG4gICAgICAgIExJTUlUIDFcclxuICAgICAgYCxcclxuICAgICAgW2FwcG9pbnRtZW50SWRdXHJcbiAgICApO1xyXG4gICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiBOdW1iZXIocmVzdWx0LnJvd3NbMF0ucGF0aWVudF9pZCk7XHJcbiAgfVxyXG59XHJcbiJdfQ==