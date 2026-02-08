// server/server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
import cors from "cors";

dotenv.config();

const { Pool } = pkg;
const app = express();

/* =========================
   BASIC MIDDLEWARE
========================= */
app.use(express.json({ limit: "1mb" }));

const ALLOWED_ORIGINS = [
  "https://samandar90.github.io",
  "https://samandar90.github.io/Kamilovs-CRM",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Postman/curl

      // строгий allowlist, но можно временно смягчить внизу
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      // ⚠️ если хочешь совсем мягко как раньше — оставь true
      return cb(null, true);
      // или строго:
      // return cb(new Error("CORS blocked"), false);
    },
    credentials: false,
  }),
);

/* =========================
   PATHS
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   CONFIG
========================= */
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = process.env.PUBLIC_DIR || "../public";

/* =========================
   DATABASE (PostgreSQL)
========================= */
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is missing in env.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

async function dbNow() {
  const r = await pool.query("SELECT now() as now");
  return r.rows?.[0]?.now;
}

/* =========================
   STATIC FRONTEND (optional)
========================= */
app.use(express.static(path.resolve(__dirname, PUBLIC_DIR)));

/* =========================
   HELPERS
========================= */
function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}
function bad(res, status, message, details) {
  return res.status(status).json({
    ok: false,
    error: { message, ...(details ? { details } : {}) },
  });
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return null;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.trim(),
    )
  );
}

function toBool(v, def = true) {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  return def;
}

function toStr(v, def = "") {
  if (v == null) return def;
  return String(v).trim();
}

function toNumOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const plus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/[^\d]/g, "");
  return plus + digits;
}

function isLikelyDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}
function isLikelyTime(v) {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v.trim());
}

/**
 * start_at builder (DB требует NOT NULL).
 * Мы всегда делаем timestamp из date + time на стороне Postgres:
 *   start_at = ($1::date + $2::time)
 * Поэтому тут лишь валидируем вход.
 */
function validateDateTime(date, time) {
  const d = toStr(date, "");
  const t = toStr(time, "");
  if (!isLikelyDate(d)) return { ok: false, message: "date must be YYYY-MM-DD" };
  if (!isLikelyTime(t)) return { ok: false, message: "time must be HH:MM" };
  return { ok: true, date: d, time: t };
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* =========================
   HEALTH CHECK
========================= */
app.get(
  "/health",
  asyncRoute(async (req, res) => {
    const now = await dbNow();
    ok(res, { status: "server is alive", dbTime: now });
  }),
);

/* =========================
   DEBUG (temporary)
========================= */
app.get(
  "/api/_debug/doctors-columns",
  asyncRoute(async (req, res) => {
    const r = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='doctors'
      ORDER BY ordinal_position
    `);
    ok(res, r.rows);
  }),
);

app.get(
  "/api/_debug/appointments-columns",
  asyncRoute(async (req, res) => {
    const r = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='appointments'
      ORDER BY ordinal_position
    `);
    ok(res, r.rows);
  }),
);

/* =========================
   API ROUTES
========================= */

/* ---------- DOCTORS ---------- */
app.get(
  "/api/doctors",
  asyncRoute(async (req, res) => {
    const r = await pool.query(`
      SELECT
        id,
        COALESCE(full_name, name) AS name,
        COALESCE(specialty, speciality) AS speciality,
        percent,
        active,
        created_at,
        updated_at,
        telegram_chat_id,
        telegram_link_code
      FROM doctors
      ORDER BY created_at DESC NULLS LAST
    `);
    ok(res, r.rows);
  }),
);

app.post(
  "/api/doctors",
  asyncRoute(async (req, res) => {
    const b = req.body || {};
    const nm = toStr(b.name, "");
    const sp = toStr(b.speciality ?? b.specialty ?? "", "");
    const pct = toNumOrNull(b.percent);

    if (!nm || nm.length < 2) return bad(res, 400, "name is required");
    if (pct == null || pct < 0 || pct > 100)
      return bad(res, 400, "percent must be 0..100");

    const r = await pool.query(
      `
      INSERT INTO doctors (full_name, name, specialty, speciality, percent, active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        COALESCE(full_name, name) AS name,
        COALESCE(specialty, speciality) AS speciality,
        percent,
        active,
        created_at,
        updated_at,
        telegram_chat_id,
        telegram_link_code
      `,
      [nm, nm, sp, sp, Math.round(pct), toBool(b.active, true)],
    );

    ok(res, r.rows[0], 201);
  }),
);

app.put(
  "/api/doctors/:id",
  asyncRoute(async (req, res) => {
    const id = toStr(req.params.id, "");
    if (!isUuid(id)) return bad(res, 400, "invalid doctor id");

    const b = req.body || {};
    const nm = toStr(b.name, "");
    const sp = toStr(b.speciality ?? b.specialty ?? "", "");
    const pct = toNumOrNull(b.percent);

    if (!nm || nm.length < 2) return bad(res, 400, "name is required");
    if (pct == null || pct < 0 || pct > 100)
      return bad(res, 400, "percent must be 0..100");

    const r = await pool.query(
      `
      UPDATE doctors
      SET full_name=$1, name=$2, specialty=$3, speciality=$4,
          percent=$5, active=$6, updated_at=now()
      WHERE id=$7
      RETURNING
        id,
        COALESCE(full_name, name) AS name,
        COALESCE(specialty, speciality) AS speciality,
        percent,
        active,
        created_at,
        updated_at,
        telegram_chat_id,
        telegram_link_code
      `,
      [nm, nm, sp, sp, Math.round(pct), toBool(b.active, true), id],
    );

    if (!r.rows[0]) return bad(res, 404, "doctor not found");
    ok(res, r.rows[0]);
  }),
);

app.delete(
  "/api/doctors/:id",
  asyncRoute(async (req, res) => {
    const id = toStr(req.params.id, "");
    if (!isUuid(id)) return bad(res, 400, "invalid doctor id");

    await pool.query("DELETE FROM doctors WHERE id=$1", [id]);
    ok(res, { deleted: true });
  }),
);

/* ---------- SERVICES ---------- */
app.get(
  "/api/services",
  asyncRoute(async (req, res) => {
    const r = await pool.query(
      "SELECT * FROM services ORDER BY created_at DESC NULLS LAST, id ASC",
    );
    ok(res, r.rows);
  }),
);

app.post(
  "/api/services",
  asyncRoute(async (req, res) => {
    const b = req.body || {};
    const nm = toStr(b.name, "");
    if (!nm) return bad(res, 400, "name is required");

    const r = await pool.query(
      `INSERT INTO services (name, category, price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        nm,
        toStr(b.category, ""),
        Number(b.price) || 0,
        toBool(b.active, true),
      ],
    );

    ok(res, r.rows[0], 201);
  }),
);

app.put(
  "/api/services/:id",
  asyncRoute(async (req, res) => {
    const id = toStr(req.params.id, "");
    const b = req.body || {};
    const nm = toStr(b.name, "");
    if (!nm) return bad(res, 400, "name is required");

    const r = await pool.query(
      `UPDATE services
       SET name=$1, category=$2, price=$3, active=$4, updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [nm, toStr(b.category, ""), Number(b.price) || 0, toBool(b.active, true), id],
    );

    if (!r.rows[0]) return bad(res, 404, "service not found");
    ok(res, r.rows[0]);
  }),
);

app.delete(
  "/api/services/:id",
  asyncRoute(async (req, res) => {
    const id = toStr(req.params.id, "");
    await pool.query("DELETE FROM services WHERE id=$1", [id]);
    ok(res, { deleted: true });
  }),
);

/* ---------- APPOINTMENTS ---------- */
app.get(
  "/api/appointments",
  asyncRoute(async (req, res) => {
    // Возвращаем стабильно: сортировка по start_at (главное поле истины)
    const r = await pool.query(`
      SELECT *
      FROM appointments
      ORDER BY start_at ASC, id ASC
    `);
    ok(res, r.rows);
  }),
);

app.post(
  "/api/appointments",
  asyncRoute(async (req, res) => {
    const a = req.body || {};

    // принимаем оба стиля
    const date = pick(a.date, a.date);
    const time = pick(a.time, a.time);

    const doctorId = pick(a.doctorId, a.doctor_id);
    const serviceId = pick(a.serviceId, a.service_id);
    const patientName = pick(a.patientName, a.patient_name);

    if (!date || !time || !doctorId || !serviceId || !patientName) {
      return bad(res, 400, "date, time, doctorId, serviceId, patientName are required");
    }

    const dt = validateDateTime(date, time);
    if (!dt.ok) return bad(res, 400, dt.message);

    const doctorUuid = toStr(doctorId, "");
    if (!isUuid(doctorUuid)) return bad(res, 400, "doctorId must be UUID");

    // service_id: у тебя сейчас в SQL стоит $6::int — значит ждёшь int.
    // Делаем безопасно: если пришёл uuid/строка, не кастим в int, а вставляем как есть.
    // Но чтобы не сломать твою текущую таблицу, используем try-parse:
    const serviceInt = toNumOrNull(serviceId);
    if (serviceInt == null) {
      return bad(res, 400, "serviceId must be integer (your DB uses int)");
    }

    const phone = normalizePhone(pick(a.phone, a.phone) || "");
    const price = Number(pick(a.price, a.price) || 0);
    const statusVisit = toStr(pick(a.statusVisit, a.status_visit) || "scheduled", "scheduled");
    const statusPayment = toStr(pick(a.statusPayment, a.status_payment) || "unpaid", "unpaid");
    const paymentMethod = toStr(pick(a.paymentMethod, a.payment_method) || "none", "none");
    const note = toStr(pick(a.note, a.note) || "", "");

    const r = await pool.query(
      `
      INSERT INTO appointments
        (date, time, start_at, doctor_id, patient_name, phone, service_id, price, status_visit, status_payment, payment_method, note)
      VALUES
        ($1::date, $2::time, ($1::date + $2::time), $3::uuid, $4, $5, $6::int, $7::numeric, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        dt.date,
        dt.time,
        doctorUuid,
        toStr(patientName, ""),
        phone,
        serviceInt,
        Number.isFinite(price) ? price : 0,
        statusVisit,
        statusPayment,
        paymentMethod,
        note,
      ],
    );

    ok(res, r.rows[0], 201);
  }),
);

app.put(
  "/api/appointments/:id",
  asyncRoute(async (req, res) => {
    const id = toStr(req.params.id, "");
    const p = req.body || {};

    const date = pick(p.date, p.date);
    const time = pick(p.time, p.time);

    const doctorId = pick(p.doctorId, p.doctor_id);
    const serviceId = pick(p.serviceId, p.service_id);

    const patientName = pick(p.patientName, p.patient_name);
    const phone = pick(p.phone, p.phone);
    const price = pick(p.price, p.price);
    const statusVisit = pick(p.statusVisit, p.status_visit);
    const statusPayment = pick(p.statusPayment, p.status_payment);
    const paymentMethod = pick(p.paymentMethod, p.payment_method);
    const note = pick(p.note, p.note);

    // если date/time пришли — валидируем, если нет — оставляем как есть (COALESCE)
    let vDate = null;
    let vTime = null;
    if (date != null) {
      const d = toStr(date, "");
      if (!isLikelyDate(d)) return bad(res, 400, "date must be YYYY-MM-DD");
      vDate = d;
    }
    if (time != null) {
      const t = toStr(time, "");
      if (!isLikelyTime(t)) return bad(res, 400, "time must be HH:MM");
      vTime = t;
    }

    const doctorUuid = doctorId != null ? toStr(doctorId, "") : null;
    if (doctorUuid && !isUuid(doctorUuid)) {
      return bad(res, 400, "doctorId must be UUID");
    }

    const serviceInt = serviceId != null ? toNumOrNull(serviceId) : null;
    if (serviceId != null && serviceInt == null) {
      return bad(res, 400, "serviceId must be integer (your DB uses int)");
    }

    const r = await pool.query(
      `
      UPDATE appointments SET
        date = COALESCE($1::date, date),
        time = COALESCE($2::time, time),
        start_at = (COALESCE($1::date, date) + COALESCE($2::time, time)),
        doctor_id = COALESCE($3::uuid, doctor_id),
        patient_name = COALESCE($4, patient_name),
        phone = COALESCE($5, phone),
        service_id = COALESCE($6::int, service_id),
        price = COALESCE($7::numeric, price),
        status_visit = COALESCE($8, status_visit),
        status_payment = COALESCE($9, status_payment),
        payment_method = COALESCE($10, payment_method),
        note = COALESCE($11, note),
        updated_at = now()
      WHERE id=$12
      RETURNING *
      `,
      [
        vDate,
        vTime,
        doctorUuid ?? null,
        patientName ?? null,
        phone != null ? normalizePhone(phone) : null,
        serviceInt,
        price != null ? Number(price) : null,
        statusVisit ?? null,
        statusPayment ?? null,
        paymentMethod ?? null,
        note ?? null,
        id,
      ],
    );

    if (!r.rows[0]) return bad(res, 404, "appointment not found");
    ok(res, r.rows[0]);
  }),
);

app.delete(
  "/api/appointments/:id",
  asyncRoute(async (req, res) => {
    const id = toStr(req.params.id, "");
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    ok(res, { deleted: true });
  }),
);

/* =========================
   404 FALLBACK (API)
========================= */
app.use("/api", (req, res) => {
  bad(res, 404, "API endpoint not found");
});

/* =========================
   ERROR HANDLER (last)
========================= */
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  const msg = err?.message || err?.detail || "Internal Server Error";
  bad(res, 500, "Internal Server Error", msg);
});

/* =========================
   START SERVER
========================= */
(async () => {
  try {
    const now = await dbNow();
    console.log("====================================");
    console.log("DB connected. Time:", now);
    console.log("SERVER STARTING...");
    console.log("====================================");

    app.listen(PORT, () => {
      console.log("====================================");
      console.log("SERVER STARTED");
      console.log(`http://localhost:${PORT}`);
      console.log("====================================");
    });
  } catch (e) {
    console.error("FATAL: DB connection failed:", e);
    process.exit(1);
  }
})();
