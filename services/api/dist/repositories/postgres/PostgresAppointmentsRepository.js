"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresAppointmentsRepository = void 0;
const errorHandler_1 = require("../../middleware/errorHandler");
const database_1 = require("../../config/database");
const appointmentTimestamps_1 = require("../../utils/appointmentTimestamps");
const localDateTime_1 = require("../../utils/localDateTime");
const numbers_1 = require("../../utils/numbers");
/** Любой ввод цены (JSON-строка с пробелами) → число для NUMERIC в PostgreSQL. */
const coerceAppointmentPriceForDb = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const n = (0, numbers_1.parseNumericInput)(value);
    if (n === null) {
        throw new errorHandler_1.ApiError(400, "Некорректная цена записи");
    }
    if (n < 0) {
        throw new errorHandler_1.ApiError(400, "Цена не может быть отрицательной");
    }
    return Math.round(n);
};
const mapAppointmentRow = (row) => ({
    id: Number(row.id),
    patientId: Number(row.patient_id),
    doctorId: Number(row.doctor_id),
    serviceId: Number(row.service_id),
    price: row.price == null ? null : (0, numbers_1.parseNumericFromPg)(row.price),
    startAt: (0, localDateTime_1.normalizeToLocalDateTime)(row.start_at),
    endAt: (0, localDateTime_1.normalizeToLocalDateTime)(row.end_at),
    status: row.status,
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at ? (0, localDateTime_1.normalizeToLocalDateTime)(row.cancelled_at) : null,
    cancelledBy: row.cancelled_by != null ? Number(row.cancelled_by) : null,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    notes: row.notes,
    createdAt: (0, localDateTime_1.normalizeToLocalDateTime)(row.created_at),
    updatedAt: (0, localDateTime_1.normalizeToLocalDateTime)(row.updated_at),
});
const SELECT_LIST = `
  id,
  patient_id,
  doctor_id,
  service_id,
  price,
  start_at,
  end_at,
  status,
  cancel_reason,
  cancelled_at,
  cancelled_by,
  diagnosis,
  treatment,
  notes,
  created_at,
  updated_at
`;
class PostgresAppointmentsRepository {
    async findAll(filters = {}) {
        const whereClauses = ["deleted_at IS NULL"];
        const values = [];
        if (filters.patientId !== undefined) {
            values.push(filters.patientId);
            whereClauses.push(`patient_id = $${values.length}`);
        }
        if (filters.doctorId !== undefined) {
            values.push(filters.doctorId);
            whereClauses.push(`doctor_id = $${values.length}`);
        }
        if (filters.serviceId !== undefined) {
            values.push(filters.serviceId);
            whereClauses.push(`service_id = $${values.length}`);
        }
        if (filters.status !== undefined) {
            values.push(filters.status);
            whereClauses.push(`status = $${values.length}`);
        }
        if (filters.startFrom != null) {
            const v = (0, appointmentTimestamps_1.assertOptionalAppointmentTimestampForDb)(filters.startFrom, "startFrom");
            if (v != null) {
                values.push(v);
                whereClauses.push(`start_at >= $${values.length}::timestamptz`);
            }
        }
        const upperBound = filters.startTo ?? filters.endTo;
        if (upperBound != null) {
            const v = (0, appointmentTimestamps_1.assertOptionalAppointmentTimestampForDb)(upperBound, "startTo");
            if (v != null) {
                values.push(v);
                whereClauses.push(`start_at <= $${values.length}::timestamptz`);
            }
        }
        const query = `
      SELECT ${SELECT_LIST}
      FROM appointments
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY start_at DESC
    `;
        const result = await database_1.dbPool.query(query, values);
        return result.rows.map(mapAppointmentRow);
    }
    async findById(id) {
        const result = await database_1.dbPool.query(`
        SELECT ${SELECT_LIST}
        FROM appointments
        WHERE id = $1
        LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapAppointmentRow(result.rows[0]);
    }
    async create(data) {
        const startAt = (0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(data.startAt, "startAt");
        const endAt = (0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(data.endAt, "endAt");
        const hasConflict = await this.findConflicting(data.doctorId, startAt, endAt);
        if (hasConflict) {
            throw new errorHandler_1.ApiError(409, "Doctor already has an appointment in this time slot");
        }
        const result = await database_1.dbPool.query(`
        INSERT INTO appointments (
          patient_id,
          doctor_id,
          service_id,
          price,
          start_at,
          end_at,
          status,
          cancel_reason,
          cancelled_at,
          cancelled_by,
          diagnosis,
          treatment,
          notes
        )
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13)
        RETURNING ${SELECT_LIST}
      `, [
            data.patientId,
            data.doctorId,
            data.serviceId,
            data.price == null ? null : coerceAppointmentPriceForDb(data.price),
            startAt,
            endAt,
            data.status,
            data.cancelReason ?? null,
            null,
            null,
            data.diagnosis ?? null,
            data.treatment ?? null,
            data.notes ?? null,
        ]);
        return mapAppointmentRow(result.rows[0]);
    }
    async update(id, data) {
        const current = await this.findById(id);
        if (!current) {
            return null;
        }
        const nextDoctorId = data.doctorId ?? current.doctorId;
        const nextStartAt = data.startAt ?? current.startAt;
        const nextEndAt = data.endAt ?? current.endAt;
        const hasConflict = await this.findConflicting(nextDoctorId, nextStartAt, nextEndAt, id);
        if (hasConflict) {
            throw new errorHandler_1.ApiError(409, "Doctor already has an appointment in this time slot");
        }
        const setClauses = [];
        const values = [];
        if (data.patientId !== undefined) {
            values.push(data.patientId);
            setClauses.push(`patient_id = $${values.length}`);
        }
        if (data.doctorId !== undefined) {
            values.push(data.doctorId);
            setClauses.push(`doctor_id = $${values.length}`);
        }
        if (data.serviceId !== undefined) {
            values.push(data.serviceId);
            setClauses.push(`service_id = $${values.length}`);
        }
        if (data.price !== undefined) {
            values.push(data.price === null ? null : coerceAppointmentPriceForDb(data.price));
            setClauses.push(`price = $${values.length}`);
        }
        if (data.startAt !== undefined) {
            values.push((0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(data.startAt, "startAt"));
            setClauses.push(`start_at = $${values.length}::timestamptz`);
        }
        if (data.endAt !== undefined) {
            values.push((0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(data.endAt, "endAt"));
            setClauses.push(`end_at = $${values.length}::timestamptz`);
        }
        if (data.status !== undefined) {
            values.push(data.status);
            setClauses.push(`status = $${values.length}`);
        }
        if (data.cancelReason !== undefined) {
            values.push(data.cancelReason);
            setClauses.push(`cancel_reason = $${values.length}`);
        }
        if (data.diagnosis !== undefined) {
            values.push(data.diagnosis);
            setClauses.push(`diagnosis = $${values.length}`);
        }
        if (data.treatment !== undefined) {
            values.push(data.treatment);
            setClauses.push(`treatment = $${values.length}`);
        }
        if (data.notes !== undefined) {
            values.push(data.notes);
            setClauses.push(`notes = $${values.length}`);
        }
        if (setClauses.length === 0) {
            return this.findById(id);
        }
        setClauses.push(`updated_at = NOW()`);
        values.push(id);
        const result = await database_1.dbPool.query(`
        UPDATE appointments
        SET ${setClauses.join(", ")}
        WHERE id = $${values.length} AND deleted_at IS NULL
        RETURNING ${SELECT_LIST}
      `, values);
        if (result.rows.length === 0) {
            return null;
        }
        return mapAppointmentRow(result.rows[0]);
    }
    async updatePrice(id, price) {
        const result = await database_1.dbPool.query(`
        UPDATE appointments
        SET
          price = $2,
          updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${SELECT_LIST}
      `, [id, coerceAppointmentPriceForDb(price)]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapAppointmentRow(result.rows[0]);
    }
    async cancel(id, cancelReason, cancelledBy) {
        const result = await database_1.dbPool.query(`
        UPDATE appointments
        SET
          status = 'cancelled',
          cancel_reason = $2,
          cancelled_at = NOW(),
          cancelled_by = $3,
          updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${SELECT_LIST}
      `, [id, cancelReason, cancelledBy]);
        if (result.rows.length === 0) {
            return null;
        }
        return mapAppointmentRow(result.rows[0]);
    }
    async delete(id) {
        return this.softDelete(id);
    }
    async softDelete(id) {
        const result = await database_1.dbPool.query(`
        UPDATE appointments
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [id]);
        return result.rows.length > 0;
    }
    async findConflicting(doctorId, startAt, endAt, excludeId) {
        const s = (0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(startAt, "startAt");
        const e = (0, appointmentTimestamps_1.assertAppointmentTimestampForDb)(endAt, "endAt");
        const values = [doctorId, e, s];
        let query = `
      SELECT 1
      FROM appointments
      WHERE doctor_id = $1
        AND deleted_at IS NULL
        AND start_at < $2::timestamptz
        AND end_at > $3::timestamptz
        AND status IN ('scheduled', 'confirmed', 'arrived', 'in_consultation')
    `;
        if (excludeId !== undefined) {
            values.push(excludeId);
            query += ` AND id <> $${values.length}`;
        }
        query += " LIMIT 1";
        const result = await database_1.dbPool.query(query, values);
        return result.rows.length > 0;
    }
    async patientExists(id) {
        const result = await database_1.dbPool.query("SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND deleted_at IS NULL) AS exists", [id]);
        return result.rows[0]?.exists === true;
    }
    async doctorExists(id) {
        const result = await database_1.dbPool.query("SELECT EXISTS(SELECT 1 FROM doctors WHERE id = $1) AS exists", [id]);
        return result.rows[0]?.exists === true;
    }
    async serviceExists(id) {
        const result = await database_1.dbPool.query("SELECT EXISTS(SELECT 1 FROM services WHERE id = $1 AND deleted_at IS NULL) AS exists", [id]);
        return result.rows[0]?.exists === true;
    }
    async isServiceActive(serviceId) {
        const result = await database_1.dbPool.query(`
        SELECT EXISTS(
          SELECT 1
          FROM services
          WHERE id = $1
            AND active = true
            AND deleted_at IS NULL
        ) AS exists
      `, [serviceId]);
        return result.rows[0]?.exists === true;
    }
    async getServiceDuration(serviceId) {
        const result = await database_1.dbPool.query(`
        SELECT duration
        FROM services
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `, [serviceId]);
        if (result.rows.length === 0) {
            return null;
        }
        const d = (0, numbers_1.parseNumericInput)(result.rows[0].duration);
        return d != null && d > 0 ? Math.round(d) : null;
    }
    async getServicePrice(serviceId) {
        const result = await database_1.dbPool.query(`
        SELECT price
        FROM services
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `, [serviceId]);
        if (result.rows.length === 0) {
            return null;
        }
        return (0, numbers_1.parseNumericFromPg)(result.rows[0].price);
    }
    async isServiceAssignedToDoctor(serviceId, doctorId) {
        const result = await database_1.dbPool.query(`
        SELECT EXISTS(
          SELECT 1
          FROM doctor_services
          WHERE service_id = $1
            AND doctor_id = $2
        ) AS exists
      `, [serviceId, doctorId]);
        return result.rows[0]?.exists === true;
    }
}
exports.PostgresAppointmentsRepository = PostgresAppointmentsRepository;
