"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresExpensesRepository = void 0;
const database_1 = require("../../config/database");
const numbers_1 = require("../../utils/numbers");
const toIso = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const num = (value) => (0, numbers_1.parseMoneyColumn)(value, 0);
const mapExpense = (row) => ({
    id: Number(row.id),
    amount: num(row.amount),
    category: row.category,
    description: row.description,
    paidAt: toIso(row.paid_at),
    createdAt: toIso(row.created_at),
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
});
class PostgresExpensesRepository {
    async findAll(filters = {}) {
        const clauses = ["deleted_at IS NULL"];
        const values = [];
        if (filters.category) {
            values.push(filters.category);
            clauses.push(`category = $${values.length}`);
        }
        if (filters.dateFrom) {
            values.push(filters.dateFrom);
            clauses.push(`paid_at >= $${values.length}::timestamptz`);
        }
        if (filters.dateTo) {
            values.push(filters.dateTo);
            clauses.push(`paid_at <= $${values.length}::timestamptz`);
        }
        const result = await database_1.dbPool.query(`
        SELECT
          id,
          amount,
          category,
          description,
          paid_at,
          created_at,
          deleted_at
        FROM expenses
        WHERE ${clauses.join(" AND ")}
        ORDER BY paid_at DESC, id DESC
      `, values);
        return result.rows.map(mapExpense);
    }
    async create(input) {
        const result = await database_1.dbPool.query(`
        INSERT INTO expenses (amount, category, description, paid_at)
        VALUES ($1, $2, $3, $4::timestamptz)
        RETURNING id, amount, category, description, paid_at, created_at, deleted_at
      `, [input.amount, input.category, input.description ?? null, input.paidAt]);
        return mapExpense(result.rows[0]);
    }
    async update(id, input) {
        const result = await database_1.dbPool.query(`
        UPDATE expenses
        SET
          amount = COALESCE($2::numeric, amount),
          category = COALESCE($3::text, category),
          description = COALESCE($4::text, description),
          paid_at = COALESCE($5::timestamptz, paid_at)
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, amount, category, description, paid_at, created_at, deleted_at
      `, [id, input.amount ?? null, input.category ?? null, input.description ?? null, input.paidAt ?? null]);
        return result.rows[0] ? mapExpense(result.rows[0]) : null;
    }
    async delete(id) {
        const result = await database_1.dbPool.query(`
        UPDATE expenses
        SET deleted_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id
      `, [id]);
        return result.rows.length > 0;
    }
}
exports.PostgresExpensesRepository = PostgresExpensesRepository;
