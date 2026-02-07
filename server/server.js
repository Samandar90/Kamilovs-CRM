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
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // пока мягко: пропускаем всех. Потом ужесточим.
      return cb(null, true);
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

async function dbNow() {
  const r = await pool.query("SELECT now() as now");
  return r.rows?.[0]?.now;
}

/* =========================
   STATIC FRONTEND (optional)
========================= */
app.use(express.static(path.resolve(__dirname, PUBLIC_DIR)));

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", async (req, res) => {
  try {
    const now = await dbNow();
    res.json({ ok: true, status: "server is alive", dbTime: now });
  } catch (err) {
    console.error("GET /health error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   DEBUG (temporary)
========================= */
app.get("/api/_debug/schema", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('doctors','services','appointments')
      ORDER BY table_name, ordinal_position
    `);
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/_debug/schema error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   HELPERS
========================= */
function pick(v1, v2) {
  return v1 != null ? v1 : v2;
}

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
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

/* =========================
   API ROUTES
========================= */

/* ---------- DOCTORS ----------
   DB columns (реальные):
   - id (uuid)
   - full_name (text NOT NULL)
   - specialty (text)
   - percent (integer) [у тебя уже есть]
   - active (boolean)
   - created_at (timestamp)
   - updated_at (timestamptz)
   + telegram_chat_id, telegram_link_code (оставляем на будущее)
*/
app.get("/api/doctors", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        id,
        full_name AS name,
        specialty AS speciality,
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
  } catch (err) {
    console.error("GET /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.post("/api/doctors", async (req, res) => {
  try {
    const { name, speciality = "", percent = 0, active = true } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "name is required" });
    }

    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "percent must be 0..100" });
    }

    const r = await pool.query(
      `
      INSERT INTO doctors (full_name, specialty, percent, active)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        full_name AS name,
        specialty AS speciality,
        percent,
        active,
        created_at,
        updated_at,
        telegram_chat_id,
        telegram_link_code
      `,
      [String(name).trim(), String(speciality).trim(), Math.round(pct), toBool(active, true)]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.put("/api/doctors/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ error: "invalid doctor id" });

    const { name, speciality = "", percent = 0, active = true } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "name is required" });
    }

    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "percent must be 0..100" });
    }

    const r = await pool.query(
      `
      UPDATE doctors
      SET full_name=$1, specialty=$2, percent=$3, active=$4, updated_at=now()
      WHERE id=$5
      RETURNING
        id,
        full_name AS name,
        specialty AS speciality,
        percent,
        active,
        created_at,
        updated_at,
        telegram_chat_id,
        telegram_link_code
      `,
      [String(name).trim(), String(speciality).trim(), Math.round(pct), toBool(active, true), id]
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
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ error: "invalid doctor id" });

    await pool.query("DELETE FROM doctors WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/doctors error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

/* ---------- SERVICES ----------
   Оставляем как было (name/category/price/active).
   Если в твоей БД services уже другая — скажешь, подстроим.
*/
app.get("/api/services", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM services ORDER BY created_at DESC NULLS LAST, id ASC");
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/services error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.post("/api/services", async (req, res) => {
  try {
    const { name, category = "", price = 0, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `INSERT INTO services (name, category, price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [String(name).trim(), String(category).trim(), Number(price) || 0, toBool(active, true)]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /api/services error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.put("/api/services/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, category = "", price = 0, active = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = await pool.query(
      `UPDATE services
       SET name=$1, category=$2, price=$3, active=$4, updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [String(name).trim(), String(category).trim(), Number(price) || 0, toBool(active, true), id]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "service not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("PUT /api/services error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.delete("/api/services/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM services WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/services error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

/* ---------- APPOINTMENTS ----------
   ВАЖНО: doctor_id должен быть UUID, потому что doctors.id = uuid.
   service_id оставляем как есть (у тебя services вероятно bigserial).
   Если services тоже uuid — скажешь, подстроим.
*/
app.get("/api/appointments", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/appointments error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

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
      `INSERT INTO appointments
        (date, time, doctor_id, patient_name, phone, service_id, price, status_visit, status_payment, payment_method, note)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
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
      ]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /api/appointments error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
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
      ]
    );

    if (!r.rows[0]) return res.status(404).json({ error: "appointment not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("PUT /api/appointments error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.delete("/api/appointments/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM appointments WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/appointments error:", err);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
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
