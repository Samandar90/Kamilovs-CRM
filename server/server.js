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

/* =========================
   CORS
   Можно ограничить origin позже (лучше так и сделать)
========================= */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // запросы без origin (curl/postman) — разрешаем
      if (!origin) return cb(null, true);

      // если список не задан — разрешаем всем (как у тебя было origin:true)
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);

      return cb(null, ALLOWED_ORIGINS.includes(origin));
    },
    credentials: false,
  })
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
  console.warn("⚠️ DATABASE_URL is not set. API will fail to use DB.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =========================
   HELPERS
========================= */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* =========================
   AUTO INIT TABLES
========================= */
async function initDb() {
  // doctors
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      speciality TEXT DEFAULT '',
      percent INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      telegram_chat_id TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // services
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      price BIGINT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // appointments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY,
      date TEXT NOT NULL,          -- YYYY-MM-DD
      time TEXT NOT NULL,          -- HH:MM
      doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
      patient_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      service_id BIGINT REFERENCES services(id) ON DELETE SET NULL,
      price BIGINT NOT NULL DEFAULT 0,
      status_visit TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled|done|no_show
      status_payment TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid|partial|paid (позже заменим на payments)
      payment_method TEXT NOT NULL DEFAULT 'none',      -- none|cash|card|online
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // индекс на дату/время (ускорит выборки)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_date_time
    ON appointments (date, time);
  `);
}

/* =========================
   STATIC FRONTEND (optional)
========================= */
app.use(express.static(path.resolve(__dirname, PUBLIC_DIR)));

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "server is alive" });
});

/* =========================
   DATABASE TEST
========================= */
app.get(
  "/db-test",
  asyncHandler(async (req, res) => {
    const r = await pool.query("SELECT now() as now");
    res.json({ ok: true, dbTime: r.rows[0].now });
  })
);

/* =========================
   API ROUTES
========================= */

// ---- Doctors
app.get(
  "/api/doctors",
  asyncHandler(async (req, res) => {
    const r = await pool.query("SELECT * FROM doctors ORDER BY id ASC");
    res.json(r.rows);
  })
);

app.post(
  "/api/doctors",
  asyncHandler(async (req, res) => {
    const { name, speciality = "", percent = 0, active = true, telegram_chat_id = "" } =
      req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `INSERT INTO doctors (name, speciality, percent, active, telegram_chat_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, speciality, Number(percent) || 0, Boolean(active), String(telegram_chat_id || "")]
    );
    res.json(r.rows[0]);
  })
);

app.put(
  "/api/doctors/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const { name, speciality = "", percent = 0, active = true, telegram_chat_id = "" } =
      req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `UPDATE doctors
       SET name=$1, speciality=$2, percent=$3, active=$4, telegram_chat_id=$5, updated_at=now()
       WHERE id=$6
       RETURNING *`,
      [name, speciality, Number(percent) || 0, Boolean(active), String(telegram_chat_id || ""), id]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "doctor not found" });
    res.json(r.rows[0]);
  })
);

app.delete(
  "/api/doctors/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    await pool.query("DELETE FROM doctors WHERE id=$1", [id]);
    res.json({ ok: true });
  })
);

// ---- Services
app.get(
  "/api/services",
  asyncHandler(async (req, res) => {
    const r = await pool.query("SELECT * FROM services ORDER BY id ASC");
    res.json(r.rows);
  })
);

app.post(
  "/api/services",
  asyncHandler(async (req, res) => {
    const { name, category = "", price = 0, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `INSERT INTO services (name, category, price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, category, Number(price) || 0, Boolean(active)]
    );
    res.json(r.rows[0]);
  })
);

app.put(
  "/api/services/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const { name, category = "", price = 0, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `UPDATE services
       SET name=$1, category=$2, price=$3, active=$4, updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [name, category, Number(price) || 0, Boolean(active), id]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "service not found" });
    res.json(r.rows[0]);
  })
);

app.delete(
  "/api/services/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    await pool.query("DELETE FROM services WHERE id=$1", [id]);
    res.json({ ok: true });
  })
);

// ---- Appointments (snake_case input/output)
app.get(
  "/api/appointments",
  asyncHandler(async (req, res) => {
    const r = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
    res.json(r.rows);
  })
);

app.post(
  "/api/appointments",
  asyncHandler(async (req, res) => {
    const a = req.body || {};

    const required = ["date", "time", "doctor_id", "patient_name", "service_id"];
    for (const k of required) {
      if (!a[k]) return res.status(400).json({ error: `${k} is required` });
    }

    const r = await pool.query(
      `INSERT INTO appointments
        (date, time, doctor_id, patient_name, phone, service_id, price, status_visit, status_payment, payment_method, note)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        a.date,
        a.time,
        Number(a.doctor_id),
        a.patient_name,
        a.phone || "",
        Number(a.service_id),
        Number(a.price) || 0,
        a.status_visit || "scheduled",
        a.status_payment || "unpaid",
        a.payment_method || "none",
        a.note || "",
      ]
    );

    res.json(r.rows[0]);
  })
);

app.put(
  "/api/appointments/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const p = req.body || {};

    const r = await pool.query(
      `UPDATE appointments SET
        date = COALESCE($1, date),
        time = COALESCE($2, time),
        doctor_id = COALESCE($3, doctor_id),
        patient_name = COALESCE($4, patient_name),
        phone = COALESCE($5, phone),
        service_id = COALESCE($6, service_id),
        price = COALESCE($7, price),
        status_visit = COALESCE($8, status_visit),
        status_payment = COALESCE($9, status_payment),
        payment_method = COALESCE($10, payment_method),
        note = COALESCE($11, note),
        updated_at = now()
       WHERE id=$12
       RETURNING *`,
      [
        p.date ?? null,
        p.time ?? null,
        p.doctor_id != null ? Number(p.doctor_id) : null,
        p.patient_name ?? null,
        p.phone ?? null,
        p.service_id != null ? Number(p.service_id) : null,
        p.price != null ? Number(p.price) : null,
        p.status_visit ?? null,
        p.status_payment ?? null,
        p.payment_method ?? null,
        p.note ?? null,
        id,
      ]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "appointment not found" });
    res.json(r.rows[0]);
  })
);

app.delete(
  "/api/appointments/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    res.json({ ok: true });
  })
);

/* =========================
   404 FALLBACK (API)
========================= */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("API ERROR:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

/* =========================
   START SERVER
========================= */
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log("====================================");
      console.log("SERVER STARTED");
      console.log(`http://localhost:${PORT}`);
      console.log("====================================");
    });
  })
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });
