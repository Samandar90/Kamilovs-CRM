import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;
const app = express();

/* =========================
   BASIC MIDDLEWARE
========================= */
app.use(express.json());

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
  ssl: { rejectUnauthorized: false }
});

/* =========================
   STATIC FRONTEND
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
    res.json({
      ok: true,
      dbTime: r.rows[0].now
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
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
app.listen(PORT, () => {
  console.log("====================================");
  console.log("SERVER STARTED");
  console.log(`http://localhost:${PORT}`);
  console.log("====================================");
});