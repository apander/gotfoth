#!/usr/bin/env node
/* eslint-disable no-console */
const { Pool } = require("pg");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const NEON_DATABASE_URL = requireEnv("NEON_DATABASE_URL");

const TABLES = ["boundaries", "settings", "papers"];

async function sbCount(table) {
  const query = new URLSearchParams();
  query.set("select", "id");
  query.set("limit", "1");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query.toString()}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Supabase count failed for ${table}: ${res.status} ${raw}`);
  }
  const range = res.headers.get("content-range") || "";
  const slash = range.lastIndexOf("/");
  if (slash < 0) return null;
  const total = parseInt(range.slice(slash + 1), 10);
  return Number.isFinite(total) ? total : null;
}

async function neonCount(pool, table) {
  const r = await pool.query(`select count(*)::bigint as c from ${table}`);
  return parseInt(String(r.rows[0].c), 10);
}

async function main() {
  const pool = new Pool({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  try {
    let ok = true;
    for (const table of TABLES) {
      const [s, n] = await Promise.all([sbCount(table), neonCount(pool, table)]);
      const match = s === n;
      if (!match) ok = false;
      console.log(`${table}: supabase=${s} neon=${n} ${match ? "OK" : "MISMATCH"}`);
    }
    if (!ok) process.exit(2);
    console.log("Parity validation passed.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
