import express from "express";
import dotenv from "dotenv";
import pkg from "pg";
import cors from "cors";

dotenv.config();

const { Pool } = pkg;
const app = express();

/* =========================
   CONFIG
========================= */
const PORT = process.env.PORT || 3000;

// Можно ограничить CORS через env:
// CORS_ORIGINS=https://samandar90.github.io,https://kamilovs-crm.onrender.com
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      // запросы без origin (Postman/curl) — разрешаем
      if (!origin) return cb(null, true);

      // если список не задан — разрешаем всем (как раньше)
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);

      return cb(null, ALLOWED_ORIGINS.includes(origin));
    },
    credentials: false,
  })
);

/* =========================
   DATABASE
========================= */
if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. Render DB must be connected.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* =========================
   DB INIT + MIGRATIONS
========================= */
async function initDb() {
  // 1) doctors
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

  // 2) services
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

  // 3) appointments (создаст только если таблицы ещё нет)
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
      status_visit TEXT NOT NULL DEFAULT 'scheduled',
      status_payment TEXT NOT NULL DEFAULT 'unpaid',
      payment_method TEXT NOT NULL DEFAULT 'none',
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // 4) MIGRATIONS для старой таблицы appointments (если она уже была создана иначе)
  // Эти запросы НЕ ломают, если колонки уже есть.
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS date TEXT;`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time TEXT;`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id BIGINT;`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_id BIGINT;`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price BIGINT NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status_visit TEXT NOT NULL DEFAULT 'scheduled';`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status_payment TEXT NOT NULL DEFAULT 'unpaid';`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'none';`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();`);

  // 5) индексы (после того как колонки гарантированно существуют)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_date_time
    ON appointments (date, time);
  `);
}

/* =========================
   HEALTH
========================= */
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "server is alive" });
});

/* =========================
   DB TEST
========================= */
app.get(
  "/db-test",
  asyncHandler(async (req, res) => {
    const r = await pool.query("SELECT now() as now");
    res.json({ ok: true, dbTime: r.rows[0].now });
  })
);

/* =========================
   API: DOCTORS
========================= */
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
       VALUES ($1,$2,$3,$4,$5)
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
    await pool.query("DELETE FROM doctors WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  })
);

/* =========================
   API: SERVICES
========================= */
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
       VALUES ($1,$2,$3,$4)
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
    await pool.query("DELETE FROM services WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  })
);

/* =========================
   API: APPOINTMENTS (snake_case)
========================= */
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
    await pool.query("DELETE FROM appointments WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  })
);

/* =========================
   404 for /api
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
   START
========================= */
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log("====================================");
      console.log("SERVER STARTED");
      console.log(`PORT: ${PORT}`);
      console.log("====================================");
    });
  })
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });
