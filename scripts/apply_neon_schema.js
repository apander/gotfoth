#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const NEON_DATABASE_URL = requireEnv("NEON_DATABASE_URL");
const repoRoot = path.resolve(__dirname, "..");
const migrationDir = path.join(repoRoot, "neon", "migrations");
const seedPath = path.join(repoRoot, "neon", "seed.sql");

async function main() {
  const pool = new Pool({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const files = fs
      .readdirSync(migrationDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
      if (!sql.trim()) continue;
      console.log(`Applying migration: ${file}`);
      await pool.query(sql);
    }
    if (fs.existsSync(seedPath)) {
      const seed = fs.readFileSync(seedPath, "utf8");
      if (seed.trim()) {
        console.log("Applying seed.sql");
        await pool.query(seed);
      }
    }
    console.log("Neon schema apply complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
