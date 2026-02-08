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
      // без origin — Postman/curl
      if (!origin) return cb(null, true);

      // сейчас мягко разрешаем (как у тебя)
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, true);
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
const PORT = process.env.PORT || 3000;
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
  ssl: { rejectUnauthorized: false },
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
function pick(v1, v2) {
  return v1 != null ? v1 : v2;
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
    if (["true", "1", "yes", "y"].includes(s)) return true;
    if (["false", "0", "no", "n"].includes(s)) return false;
  }
  return def;
}

function toStr(v, def = "") {
  if (v == null) return def;
  return String(v);
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

/**
 * ВАЖНО для твоей БД:
 * start_at NOT NULL => обязаны формировать его из date+time.
 * date: "2026-02-07"
 * time: "14:30"
 * Возвращаем "2026-02-07T14:30:00"
 */
function buildStartAt(date, time) {
  const d = String(date || "").trim();
  const t = String(time || "").trim();

  // минимальная проверка формата
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!/^\d{2}:\d{2}$/.test(t)) return null;

  return `${d}T${t}:00`;
}

function isLikelyDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function isLikelyTime(v) {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v.trim());
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
    res.json({ ok: true, status: "server is alive", dbTime: now });
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
    res.json(r.rows);
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
    res.json(r.rows);
  }),
);

/* =========================
   API ROUTES
========================= */

/* ---------- DOCTORS ----------
  Смешанная схема:
  - full_name и name (оба NOT NULL у тебя бывало)
  - specialty и speciality
  - id uuid
*/
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
    res.json(r.rows);
  }),
);

app.post(
  "/api/doctors",
  asyncRoute(async (req, res) => {
    const {
      name,
      speciality = "",
      percent = 0,
      active = true,
    } = req.body || {};

    const nm = String(name || "").trim();
    const sp = String(speciality || "").trim();

    if (!nm || nm.length < 2) {
      return res.status(400).json({ error: "name is required" });
    }

    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "percent must be 0..100" });
    }

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
      [nm, nm, sp, sp, Math.round(pct), toBool(active, true)],
    );

    res.status(201).json(r.rows[0]);
  }),
);

app.put(
  "/api/doctors/:id",
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id))
      return res.status(400).json({ error: "invalid doctor id" });

    const {
      name,
      speciality = "",
      percent = 0,
      active = true,
    } = req.body || {};
    const nm = String(name || "").trim();
    const sp = String(speciality || "").trim();

    if (!nm || nm.length < 2) {
      return res.status(400).json({ error: "name is required" });
    }

    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "percent must be 0..100" });
    }

    const r = await pool.query(
      `
      UPDATE doctors
      SET
        full_name=$1,
        name=$2,
        specialty=$3,
        speciality=$4,
        percent=$5,
        active=$6,
        updated_at=now()
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
      [nm, nm, sp, sp, Math.round(pct), toBool(active, true), id],
    );

    if (!r.rows[0]) return res.status(404).json({ error: "doctor not found" });
    res.json(r.rows[0]);
  }),
);

app.delete(
  "/api/doctors/:id",
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id))
      return res.status(400).json({ error: "invalid doctor id" });

    await pool.query("DELETE FROM doctors WHERE id=$1", [id]);
    res.json({ ok: true });
  }),
);

/* ---------- SERVICES ----------
  Схема как ты писал: name/category/price/active (+ updated_at возможно)
  ID может быть serial/int или uuid — не делаем Number() насильно.
*/
app.get(
  "/api/services",
  asyncRoute(async (req, res) => {
    const r = await pool.query(
      "SELECT * FROM services ORDER BY created_at DESC NULLS LAST, id ASC",
    );
    res.json(r.rows);
  }),
);

app.post(
  "/api/services",
  asyncRoute(async (req, res) => {
    const { name, category = "", price = 0, active = true } = req.body || {};
    const nm = String(name || "").trim();
    if (!nm) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `INSERT INTO services (name, category, price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        nm,
        String(category || "").trim(),
        Number(price) || 0,
        toBool(active, true),
      ],
    );

    res.status(201).json(r.rows[0]);
  }),
);

app.put(
  "/api/services/:id",
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "").trim();
    const { name, category = "", price = 0, active = true } = req.body || {};
    const nm = String(name || "").trim();
    if (!nm) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `UPDATE services
       SET name=$1, category=$2, price=$3, active=$4, updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [
        nm,
        String(category || "").trim(),
        Number(price) || 0,
        toBool(active, true),
        id,
      ],
    );

    if (!r.rows[0]) return res.status(404).json({ error: "service not found" });
    res.json(r.rows[0]);
  }),
);

app.delete(
  "/api/services/:id",
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "").trim();
    await pool.query("DELETE FROM services WHERE id=$1", [id]);
    res.json({ ok: true });
  }),
);

/* ---------- APPOINTMENTS ----------
  КЛЮЧЕВО: start_at NOT NULL — заполняем всегда.
  doctor_id = uuid
  service_id — может быть int, но на всякий случай разрешаем строку/uuid
*/
app.get(
  "/api/appointments",
  asyncRoute(async (req, res) => {
    const r = await pool.query(
      "SELECT * FROM appointments ORDER BY date ASC, time ASC",
    );
    res.json(r.rows);
  }),
);

app.post("/api/appointments", async (req, res) => {
  try {
    const a = req.body || {};

    const date = pick(a.date, a.date);
    const time = pick(a.time, a.time);
    const doctorId = pick(a.doctorId, a.doctor_id);
    const serviceId = pick(a.serviceId, a.service_id);
    const patientName = pick(a.patientName, a.patient_name);

    if (!date || !time || !doctorId || !serviceId || !patientName) {
      return res.status(400).json({
        error: "date, time, doctorId, serviceId, patientName are required",
      });
    }

    const doctorUuid = String(doctorId).trim();
    if (!isUuid(doctorUuid)) {
      return res.status(400).json({ error: "doctorId must be UUID" });
    }

    const phone = pick(a.phone, a.phone) || "";
    const price = Number(pick(a.price, a.price) || 0);
    const statusVisit = pick(a.statusVisit, a.status_visit) || "scheduled";
    const statusPayment = pick(a.statusPayment, a.status_payment) || "unpaid";
    const paymentMethod = pick(a.paymentMethod, a.payment_method) || "none";
    const note = pick(a.note, a.note) || "";

    const r = await pool.query(
      `
      INSERT INTO appointments
        (date, time, start_at, doctor_id, patient_name, phone, service_id, price, status_visit, status_payment, payment_method, note)
      VALUES
        ($1::date, $2::time, ($1::date + $2::time), $3::uuid, $4, $5, $6::int, $7::numeric, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        String(date),
        String(time),
        doctorUuid,
        String(patientName),
        String(phone),
        Number(serviceId),
        price,
        String(statusVisit),
        String(statusPayment),
        String(paymentMethod),
        String(note),
      ],
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /api/appointments error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", detail: err.message });
  }
});

app.put("/api/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
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

    const doctorUuid = doctorId != null ? String(doctorId).trim() : null;
    if (doctorUuid && !isUuid(doctorUuid)) {
      return res.status(400).json({ error: "doctorId must be UUID" });
    }

    const r = await pool.query(
      `
      UPDATE appointments SET
        date = COALESCE($1::date, date),
        time = COALESCE($2::time, time),
        start_at = (
          COALESCE($1::date, date) + COALESCE($2::time, time)
        ),
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
        date ?? null,
        time ?? null,
        doctorUuid ?? null,
        patientName ?? null,
        phone ?? null,
        serviceId != null ? Number(serviceId) : null,
        price != null ? Number(price) : null,
        statusVisit ?? null,
        statusPayment ?? null,
        paymentMethod ?? null,
        note ?? null,
        id,
      ],
    );

    if (!r.rows[0])
      return res.status(404).json({ error: "appointment not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("PUT /api/appointments error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", detail: err.message });
  }
});

app.delete(
  "/api/appointments/:id",
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "").trim();
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    res.json({ ok: true });
  }),
);

/* =========================
   404 FALLBACK (API)
========================= */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

/* =========================
   ERROR HANDLER (last)
========================= */
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);

  // pg errors часто содержат detail
  const msg = err?.message || err?.detail || "Internal Server Error";

  res.status(500).json({
    error: "Internal Server Error",
    detail: msg,
  });
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
