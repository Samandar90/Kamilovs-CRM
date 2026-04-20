#!/usr/bin/env node
/**
 * PostgreSQL migrations runner for Kamilovs CRM.
 * Tracks applied files in schema_migrations (created automatically).
 *
 * Usage (from services/api):
 *   npm run db:migrate
 *
 * Requires: DATABASE_URL in .env or environment.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");
const migrationsDir = path.join(repoRoot, "packages", "database", "migrations");

require("dotenv").config({ path: path.join(apiRoot, ".env"), override: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || String(url).trim() === "") {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  if (!fs.existsSync(migrationsDir)) {
    console.error("Migrations directory not found:", migrationsDir);
    process.exit(1);
  }

  const client = new Client({ connectionString: String(url).trim() });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) {
    console.error("No migration files matched pattern 001_name.sql in", migrationsDir);
    await client.end();
    process.exit(1);
  }

  for (const name of files) {
    const done = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [name]);
    if (done.rows.length > 0) {
      console.log("[skip]", name);
      continue;
    }

    const fullPath = path.join(migrationsDir, name);
    const sql = fs.readFileSync(fullPath, "utf8");

    console.log("[apply]", name);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[fail]", name);
      throw err;
    }
  }

  await client.end();
  console.log("Done. Applied migrations from", migrationsDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
