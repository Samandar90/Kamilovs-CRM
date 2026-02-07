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
app.use(express.json());

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
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, true); // можно ужесточить позже
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
  console.error("FATAL: DATABASE_URL is missing in env.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =========================
   DB HELPERS / MIGRATIONS
========================= */
async function ensureColumn(table, col, typeSql) {
  // typeSql example: "TEXT", "BIGINT NOT NULL DEFAULT 0"
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${typeSql};`);
}

async function initDb() {
  // 1) Create базовые таблицы (если вообще нет)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id BIGSERIAL PRIMARY KEY
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id BIGSERIAL PRIMARY KEY
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY
    );
  `);

  // 2) Миграции: doctors
  await ensureColumn("doctors", "name", "TEXT");
  await ensureColumn("doctors", "speciality", "TEXT DEFAULT ''");
  await ensureColumn("doctors", "percent", "INT NOT NULL DEFAULT 0");
  await ensureColumn("doctors", "active", "BOOLEAN NOT NULL DEFAULT true");
  await ensureColumn("doctors", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT now()");
  await ensureColumn("doctors", "updated_at", "TIMESTAMPTZ");

  // Сделаем name NOT NULL безопасно
  await pool.query(`UPDATE doctors SET name = '' WHERE name IS NULL;`);
  await pool.query(`ALTER TABLE doctors ALTER COLUMN name SET NOT NULL;`);

  // 3) Миграции: services
  await ensureColumn("services", "name", "TEXT");
  await ensureColumn("services", "category", "TEXT DEFAULT ''");
  await ensureColumn("services", "price", "BIGINT NOT NULL DEFAULT 0");
  await ensureColumn("services", "active", "BOOLEAN NOT NULL DEFAULT true");
  await ensureColumn("services", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT now()");
  await ensureColumn("services", "updated_at", "TIMESTAMPTZ");

  await pool.query(`UPDATE services SET name = '' WHERE name IS NULL;`);
  await pool.query(`ALTER TABLE services ALTER COLUMN name SET NOT NULL;`);

  // 4) Миграции: appointments
  await ensureColumn("appointments", "date", "TEXT"); // YYYY-MM-DD
  await ensureColumn("appointments", "time", "TEXT"); // HH:MM
  await ensureColumn("appointments", "doctor_id", "BIGINT");
  await ensureColumn("appointments", "patient_name", "TEXT");
  await ensureColumn("appointments", "phone", "TEXT DEFAULT ''");
  await ensureColumn("appointments", "service_id", "BIGINT");
  await ensureColumn("appointments", "price", "BIGINT NOT NULL DEFAULT 0");
  await ensureColumn("appointments", "status_visit", "TEXT NOT NULL DEFAULT 'scheduled'");
  await ensureColumn("appointments", "status_payment", "TEXT NOT NULL DEFAULT 'unpaid'");
  await ensureColumn("appointments", "payment_method", "TEXT NOT NULL DEFAULT 'none'");
  await ensureColumn("appointments", "note", "TEXT DEFAULT ''");
  await ensureColumn("appointments", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT now()");
  await ensureColumn("appointments", "updated_at", "TIMESTAMPTZ");

  await pool.query(`UPDATE appointments SET patient_name = '' WHERE patient_name IS NULL;`);
  await pool.query(`ALTER TABLE appointments ALTER COLUMN patient_name SET NOT NULL;`);

  // FK (аккуратно — если уже есть, будет ошибка, поэтому ловим)
  try {
    await pool.query(`
      ALTER TABLE appointments
      ADD CONSTRAINT appointments_doctor_fk
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;
    `);
  } catch {}
  try {
    await pool.query(`
      ALTER TABLE appointments
      ADD CONSTRAINT appointments_service_fk
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
    `);
  } catch {}

  // Индексы (для скорости)
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appt_date_time ON appointments(date, time);`);
  } catch {}
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

app.get("/db-test", async (req, res) => {
  try {
    const r = await pool.query("SELECT now() as now");
    res.json({ ok: true, dbTime: r.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   API ROUTES
========================= */
// ---- Doctors (SAFE)
app.get("/api/doctors", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM doctors ORDER BY id ASC");
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.post("/api/doctors", async (req, res) => {
  console.log("POST /api/doctors body:", req.body);

  try {
    const { name, speciality = "", percent = 0, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `INSERT INTO doctors (name, speciality, percent, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [String(name).trim(), String(speciality).trim(), Number(percent) || 0, Boolean(active)]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.put("/api/doctors/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, speciality = "", percent = 0, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `UPDATE doctors
       SET name=$1, speciality=$2, percent=$3, active=$4, updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [String(name).trim(), String(speciality).trim(), Number(percent) || 0, Boolean(active), id]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "doctor not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("PUT /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.delete("/api/doctors/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM doctors WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.get("/api/_debug/doctors-columns", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name='doctors'
      ORDER BY ordinal_position
    `);
    res.json(r.rows);
  } catch (err) {
    console.error("DEBUG doctors-columns error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ---- Appointments
app.get("/api/appointments", async (req, res) => {
  const r = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
  res.json(r.rows);
});

function pick(v1, v2) {
  return v1 != null ? v1 : v2;
}

app.post("/api/appointments", async (req, res) => {
  const a = req.body || {};

  // принимаем И camelCase И snake_case
  const date = pick(a.date, a.date);
  const time = pick(a.time, a.time);
  const doctorId = pick(a.doctorId, a.doctor_id);
  const serviceId = pick(a.serviceId, a.service_id);
  const patientName = pick(a.patientName, a.patient_name);

  if (!date || !time || !doctorId || !serviceId || !patientName) {
    return res.status(400).json({ error: "date, time, doctorId, serviceId, patientName are required" });
  }

  const phone = pick(a.phone, a.phone) || "";
  const price = Number(pick(a.price, a.price) || 0);
  const statusVisit = pick(a.statusVisit, a.status_visit) || "scheduled";
  const statusPayment = pick(a.statusPayment, a.status_payment) || "unpaid";
  const paymentMethod = pick(a.paymentMethod, a.payment_method) || "none";
  const note = pick(a.note, a.note) || "";

  const r = await pool.query(
    `INSERT INTO appointments
      (date, time, doctor_id, patient_name, phone, service_id, price, status_visit, status_payment, payment_method, note)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      date,
      time,
      Number(doctorId),
      patientName,
      phone,
      Number(serviceId),
      price,
      statusVisit,
      statusPayment,
      paymentMethod,
      note,
    ]
  );

  res.json(r.rows[0]);
});

app.put("/api/appointments/:id", async (req, res) => {
  const id = req.params.id;
  const p = req.body || {};

  // camelCase + snake_case
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
      date ?? null,
      time ?? null,
      doctorId != null ? Number(doctorId) : null,
      patientName ?? null,
      phone ?? null,
      serviceId != null ? Number(serviceId) : null,
      price != null ? Number(price) : null,
      statusVisit ?? null,
      statusPayment ?? null,
      paymentMethod ?? null,
      note ?? null,
      id,
    ]
  );

  if (!r.rows[0]) return res.status(404).json({ error: "appointment not found" });
  res.json(r.rows[0]);
});

app.delete("/api/appointments/:id", async (req, res) => {
  const id = req.params.id;
  await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
  res.json({ ok: true });
});

/* =========================
   404 FALLBACK (API)
========================= */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
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
