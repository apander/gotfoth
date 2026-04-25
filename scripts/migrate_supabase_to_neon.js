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

const TABLES = [
  { name: "boundaries", order: "paper_key.asc" },
  { name: "settings", order: "key.asc" },
  { name: "papers", order: "created_at.asc" },
];

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(name || ""))) throw new Error(`Invalid SQL identifier: ${name}`);
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

async function sbSelectAll(table, order) {
  const limit = 1000;
  let offset = 0;
  const out = [];
  while (true) {
    const query = new URLSearchParams();
    query.set("select", "*");
    query.set("limit", String(limit));
    query.set("offset", String(offset));
    if (order) query.set("order", order);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query.toString()}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`Supabase read failed for ${table}: ${res.status} ${raw}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    offset += rows.length;
    if (rows.length < limit) break;
  }
  return out;
}

async function upsertRows(pool, table, rows) {
  if (!rows.length) return 0;
  const keys = Object.keys(rows[0]);
  const colsSql = keys.map((k) => quoteIdent(k)).join(", ");
  const updateSql = keys
    .filter((k) => k !== "id")
    .map((k) => `${quoteIdent(k)} = excluded.${quoteIdent(k)}`)
    .join(", ");
  const chunkSize = 250;
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const valuesSql = chunk
      .map((row, rowIdx) => {
        const placeholders = keys.map((k, colIdx) => {
          values.push(row[k]);
          return `$${rowIdx * keys.length + colIdx + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");
    const sql = `insert into ${quoteIdent(table)} (${colsSql}) values ${valuesSql} on conflict (id) do update set ${updateSql}`;
    await pool.query(sql, values);
    written += chunk.length;
  }
  return written;
}

async function main() {
  console.log("Starting Supabase -> Neon table migration...");
  const pool = new Pool({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });
  try {
    for (const t of TABLES) {
      const rows = await sbSelectAll(t.name, t.order);
      const count = await upsertRows(pool, t.name, rows);
      console.log(`${t.name}: migrated ${count} rows`);
    }
    console.log("Table migration complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
