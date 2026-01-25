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

// CORS (обязательно для GitHub Pages фронта)
// В идеале: ограничь origin своим доменом GitHub Pages
app.use(
  cors({
    origin: true, // можно заменить на "https://samandar90.github.io"
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =========================
   AUTO INIT TABLES
========================= */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      speciality TEXT DEFAULT '',
      percent INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      price BIGINT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

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
      status_payment TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid|partial|paid
      payment_method TEXT NOT NULL DEFAULT 'none',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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

// ---- Doctors
app.get("/api/doctors", async (req, res) => {
  const r = await pool.query("SELECT * FROM doctors ORDER BY id ASC");
  res.json(r.rows);
});

app.post("/api/doctors", async (req, res) => {
  const { name, speciality = "", percent = 0, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const r = await pool.query(
    `INSERT INTO doctors (name, speciality, percent, active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, speciality, Number(percent) || 0, Boolean(active)]
  );
  res.json(r.rows[0]);
});

app.put("/api/doctors/:id", async (req, res) => {
  const id = req.params.id;
  const { name, speciality = "", percent = 0, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const r = await pool.query(
    `UPDATE doctors
     SET name=$1, speciality=$2, percent=$3, active=$4
     WHERE id=$5
     RETURNING *`,
    [name, speciality, Number(percent) || 0, Boolean(active), id]
  );

  if (!r.rows[0]) return res.status(404).json({ error: "doctor not found" });
  res.json(r.rows[0]);
});

app.delete("/api/doctors/:id", async (req, res) => {
  const id = req.params.id;
  await pool.query("DELETE FROM doctors WHERE id=$1", [id]);
  res.json({ ok: true });
});

// ---- Services
app.get("/api/services", async (req, res) => {
  const r = await pool.query("SELECT * FROM services ORDER BY id ASC");
  res.json(r.rows);
});

app.post("/api/services", async (req, res) => {
  const { name, category = "", price = 0, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const r = await pool.query(
    `INSERT INTO services (name, category, price, active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, category, Number(price) || 0, Boolean(active)]
  );
  res.json(r.rows[0]);
});

app.put("/api/services/:id", async (req, res) => {
  const id = req.params.id;
  const { name, category = "", price = 0, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const r = await pool.query(
    `UPDATE services
     SET name=$1, category=$2, price=$3, active=$4
     WHERE id=$5
     RETURNING *`,
    [name, category, Number(price) || 0, Boolean(active), id]
  );

  if (!r.rows[0]) return res.status(404).json({ error: "service not found" });
  res.json(r.rows[0]);
});

app.delete("/api/services/:id", async (req, res) => {
  const id = req.params.id;
  await pool.query("DELETE FROM services WHERE id=$1", [id]);
  res.json({ ok: true });
});

// ---- Appointments
app.get("/api/appointments", async (req, res) => {
  const r = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
  res.json(r.rows);
});

app.post("/api/appointments", async (req, res) => {
  const a = req.body || {};
  const required = ["date", "time", "doctorId", "patientName", "serviceId"];
  for (const k of required) {
    if (!a[k]) return res.status(400).json({ error: `${k} is required` });
  }

  const r = await pool.query(
    `INSERT INTO appointments
      (date, time, doctor_id, patient_name, phone, service_id, price, status_visit, status_payment, payment_method)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      a.date,
      a.time,
      Number(a.doctorId),
      a.patientName,
      a.phone || "",
      Number(a.serviceId),
      Number(a.price) || 0,
      a.statusVisit || "scheduled",
      a.statusPayment || "unpaid",
      a.paymentMethod || "none",
    ]
  );

  // возвращаем в формате как у фронта (doctorId/serviceId)
  const row = r.rows[0];
  res.json({
    id: row.id,
    date: row.date,
    time: row.time,
    doctorId: row.doctor_id,
    patientName: row.patient_name,
    phone: row.phone,
    serviceId: row.service_id,
    price: row.price,
    statusVisit: row.status_visit,
    statusPayment: row.status_payment,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
  });
});

app.put("/api/appointments/:id", async (req, res) => {
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
      payment_method = COALESCE($10, payment_method)
     WHERE id=$11
     RETURNING *`,
    [
      p.date ?? null,
      p.time ?? null,
      p.doctorId != null ? Number(p.doctorId) : null,
      p.patientName ?? null,
      p.phone ?? null,
      p.serviceId != null ? Number(p.serviceId) : null,
      p.price != null ? Number(p.price) : null,
      p.statusVisit ?? null,
      p.statusPayment ?? null,
      p.paymentMethod ?? null,
      id,
    ]
  );

  if (!r.rows[0]) return res.status(404).json({ error: "appointment not found" });

  const row = r.rows[0];
  res.json({
    id: row.id,
    date: row.date,
    time: row.time,
    doctorId: row.doctor_id,
    patientName: row.patient_name,
    phone: row.phone,
    serviceId: row.service_id,
    price: row.price,
    statusVisit: row.status_visit,
    statusPayment: row.status_payment,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
  });
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