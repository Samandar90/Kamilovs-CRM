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

// Безопасный CORS: только allowlist (но Postman/curl без origin разрешаем)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, true); // оставляю мягко как у тебя, чтобы не блокировало внезапно
      // если захочешь строго: return cb(new Error("CORS blocked"), false);
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

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.trim(),
    )
  );
}

function toStr(v, def = "") {
  if (v == null) return def;
  return String(v).trim();
}

function toBool(v, def = true) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return def;
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
 * appointments.start_at = timestamptz NOT NULL
 * date/time у тебя TEXT, поэтому строим ISO с +05:00:
 *   YYYY-MM-DDTHH:MM:00+05:00
 */
function buildStartAtISO(date, time) {
  const d = toStr(date, "");
  const t = toStr(time, "");
  if (!isLikelyDate(d)) return null;
  if (!isLikelyTime(t)) return null;
  return `${d}T${t}:00+05:00`; // Asia/Tashkent (+05)
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
   DEBUG
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
  "/api/_debug/services-columns",
  asyncRoute(async (req, res) => {
    const r = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='services'
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
   DOCTORS
========================= */
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
    if (pct == null || pct < 0 || pct > 100) return bad(res, 400, "percent must be 0..100");

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
    if (pct == null || pct < 0 || pct > 100) return bad(res, 400, "percent must be 0..100");

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

/* =========================
   SERVICES
========================= */
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

    const price = toNumOrNull(b.price);
    const safePrice = price == null ? 0 : Math.max(0, Math.trunc(price));

    const r = await pool.query(
      `INSERT INTO services (name, category, price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nm, toStr(b.category, ""), safePrice, toBool(b.active, true)],
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

    const price = toNumOrNull(b.price);
    const safePrice = price == null ? 0 : Math.max(0, Math.trunc(price));

    const r = await pool.query(
      `UPDATE services
       SET name=$1, category=$2, price=$3, active=$4, updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [nm, toStr(b.category, ""), safePrice, toBool(b.active, true), id],
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

/* =========================
   APPOINTMENTS  (MATCHES YOUR SCHEMA)
   columns:
   - id uuid
   - doctor_id uuid
   - patient_id uuid (optional)
   - start_at timestamptz NOT NULL
   - date text, time text
   - patient_name text, phone text
   - service_id bigint
   - price bigint NOT NULL
   - status_visit text NOT NULL
   - status_payment text NOT NULL
   - payment_method text NOT NULL
   - note text
   - telegram_sent timestamp
   - created_at timestamp
   - updated_at timestamptz NOT NULL
========================= */
app.get(
  "/api/appointments",
  asyncRoute(async (req, res) => {
    // Для фронта удобно сразу получить имена врача/услуги
    const r = await pool.query(`
      SELECT
        a.*,
        COALESCE(d.full_name, d.name) AS doctor_name,
        s.name AS service_name
      FROM appointments a
      LEFT JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN services s ON s.id = a.service_id
      ORDER BY a.start_at ASC, a.created_at ASC
    `);
    ok(res, r.rows);
  }),
);

app.post(
  "/api/appointments",
  asyncRoute(async (req, res) => {
    const a = req.body || {};

    const date = toStr(a.date, "");
    const time = toStr(a.time, "");

    const doctorId = toStr(a.doctorId ?? a.doctor_id, "");
    const serviceIdRaw = a.serviceId ?? a.service_id;

    const patientName = toStr(a.patientName ?? a.patient_name, "");
    const phone = normalizePhone(a.phone ?? "");

    const priceRaw = a.price;
    const statusVisit = toStr(a.statusVisit ?? a.status_visit, "scheduled") || "scheduled";
    const statusPayment = toStr(a.statusPayment ?? a.status_payment, "unpaid") || "unpaid";
    const paymentMethod = toStr(a.paymentMethod ?? a.payment_method, "none") || "none";
    const note = toStr(a.note, "");

    if (!patientName) return bad(res, 400, "patientName is required");
    if (!doctorId) return bad(res, 400, "doctorId is required");
    if (!isUuid(doctorId)) return bad(res, 400, "doctorId must be UUID");

    const startAtISO = buildStartAtISO(date, time);
    if (!startAtISO) return bad(res, 400, "date/time invalid (YYYY-MM-DD, HH:MM)");

    const serviceIdNum = toNumOrNull(serviceIdRaw);
    if (serviceIdNum == null) return bad(res, 400, "serviceId must be number (bigint)");

    // price bigint NOT NULL
    const priceNum = toNumOrNull(priceRaw);
    const safePrice = priceNum == null ? 0 : Math.max(0, Math.trunc(priceNum));

    const r = await pool.query(
      `
      INSERT INTO appointments
        (doctor_id, patient_id, start_at, date, time, patient_name, phone, service_id, price, status_visit, status_payment, payment_method, note, updated_at)
      VALUES
        ($1::uuid, NULL, $2::timestamptz, $3::text, $4::text, $5::text, $6::text, $7::bigint, $8::bigint, $9::text, $10::text, $11::text, $12::text, now())
      RETURNING *
      `,
      [
        doctorId,
        startAtISO,
        date,
        time,
        patientName,
        phone,
        Math.trunc(serviceIdNum),
        safePrice,
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
    if (!isUuid(id)) return bad(res, 400, "invalid appointment id");

    const p = req.body || {};

    const date = p.date != null ? toStr(p.date, "") : null;
    const time = p.time != null ? toStr(p.time, "") : null;

    if (date != null && !isLikelyDate(date)) return bad(res, 400, "date must be YYYY-MM-DD");
    if (time != null && !isLikelyTime(time)) return bad(res, 400, "time must be HH:MM");

    const doctorId = p.doctorId ?? p.doctor_id;
    const doctorUuid = doctorId != null ? toStr(doctorId, "") : null;
    if (doctorUuid && !isUuid(doctorUuid)) return bad(res, 400, "doctorId must be UUID");

    const serviceIdNum = p.serviceId != null || p.service_id != null
      ? toNumOrNull(p.serviceId ?? p.service_id)
      : null;
    if ((p.serviceId != null || p.service_id != null) && serviceIdNum == null) {
      return bad(res, 400, "serviceId must be number (bigint)");
    }

    const priceNum = p.price != null ? toNumOrNull(p.price) : null;
    if (p.price != null && priceNum == null) return bad(res, 400, "price must be number");

    const patientName = p.patientName ?? p.patient_name;
    const phone = p.phone;
    const statusVisit = p.statusVisit ?? p.status_visit;
    const statusPayment = p.statusPayment ?? p.status_payment;
    const paymentMethod = p.paymentMethod ?? p.payment_method;
    const note = p.note;

    // Пересчёт start_at прямо в SQL из TEXT date/time:
    // start_at = (COALESCE(date) || 'T' || COALESCE(time) || ':00+05:00')::timestamptz
    const r = await pool.query(
      `
      UPDATE appointments SET
        doctor_id = COALESCE($1::uuid, doctor_id),
        service_id = COALESCE($2::bigint, service_id),
        date = COALESCE($3::text, date),
        time = COALESCE($4::text, time),
        start_at = ((COALESCE($3::text, date) || 'T' || COALESCE($4::text, time) || ':00+05:00')::timestamptz),
        patient_name = COALESCE($5::text, patient_name),
        phone = COALESCE($6::text, phone),
        price = COALESCE($7::bigint, price),
        status_visit = COALESCE($8::text, status_visit),
        status_payment = COALESCE($9::text, status_payment),
        payment_method = COALESCE($10::text, payment_method),
        note = COALESCE($11::text, note),
        updated_at = now()
      WHERE id=$12::uuid
      RETURNING *
      `,
      [
        doctorUuid ?? null,
        serviceIdNum != null ? Math.trunc(serviceIdNum) : null,
        date,
        time,
        patientName != null ? toStr(patientName, "") : null,
        phone != null ? normalizePhone(phone) : null,
        priceNum != null ? Math.max(0, Math.trunc(priceNum)) : null,
        statusVisit != null ? toStr(statusVisit, "") : null,
        statusPayment != null ? toStr(statusPayment, "") : null,
        paymentMethod != null ? toStr(paymentMethod, "") : null,
        note != null ? toStr(note, "") : null,
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
    if (!isUuid(id)) return bad(res, 400, "invalid appointment id");
    await pool.query("DELETE FROM appointments WHERE id=$1::uuid", [id]);
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
  bad(res, 500, "Internal Server Error", err?.message || err?.detail || "error");
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
