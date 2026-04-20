#!/usr/bin/env node
/**
 * Optional dev seed: default superadmin (only if no users exist).
 * Password: admin123 (change immediately).
 *
 *   npm run db:seed:dev
 */
"use strict";

const path = require("path");
const bcrypt = require("bcrypt");
const { Client } = require("pg");

const apiRoot = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(apiRoot, ".env"), override: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || String(url).trim() === "") {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({ connectionString: String(url).trim() });
  await client.connect();

  const { rows } = await client.query("SELECT COUNT(*)::text AS c FROM users WHERE deleted_at IS NULL");
  const n = Number(rows[0]?.c ?? 0);
  if (n > 0) {
    console.log("Users already exist (count=", n, "). Skip seed.");
    await client.end();
    return;
  }

  const hash = await bcrypt.hash("admin123", 10);
  await client.query(
    `
    INSERT INTO users (
      username,
      password_hash,
      full_name,
      role,
      is_active,
      doctor_id,
      deleted_at
    )
    VALUES ($1, $2, $3, $4, TRUE, NULL, NULL)
    `,
    ["admin", hash, "Administrator", "superadmin"]
  );

  await client.end();
  console.log("Seeded superadmin: username=admin password=admin123 (DEV ONLY — change now)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
