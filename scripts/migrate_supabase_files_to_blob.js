#!/usr/bin/env node
/* eslint-disable no-console */
const { Pool } = require("pg");
const { put } = require("@vercel/blob");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const NEON_DATABASE_URL = requireEnv("NEON_DATABASE_URL");
const BLOB_READ_WRITE_TOKEN = requireEnv("BLOB_READ_WRITE_TOKEN");

const FILE_PATH_FIELDS = [
  "file_paper_path",
  "file_scheme_path",
  "file_attempt_path",
  "file_marking_yaml_path",
];

async function fetchSupabaseObject(storagePath) {
  const path = String(storagePath || "").replace(/^\/+/, "");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Failed to download ${storagePath}: ${res.status} ${raw}`);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType };
}

async function uploadToBlob(key, bytes, contentType) {
  const out = await put(key, bytes, {
    token: BLOB_READ_WRITE_TOKEN,
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  return out && out.url ? out.url : null;
}

async function main() {
  console.log("Starting Supabase Storage -> Vercel Blob migration...");
  const pool = new Pool({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });
  try {
    const rows = (await pool.query(`select id, ${FILE_PATH_FIELDS.join(", ")} from papers order by created_at asc`)).rows;
    let uploaded = 0;
    for (const row of rows) {
      const patch = {};
      for (const field of FILE_PATH_FIELDS) {
        const src = row[field];
        if (!src) continue;
        if (String(src).startsWith("http://") || String(src).startsWith("https://")) continue;
        const { bytes, contentType } = await fetchSupabaseObject(src);
        const key = String(src).replace(/^\/+/, "");
        const blobUrl = await uploadToBlob(key, bytes, contentType);
        if (blobUrl) {
          patch[field] = blobUrl;
          uploaded += 1;
          console.log(`uploaded ${row.id} ${field}`);
        }
      }
      const keys = Object.keys(patch);
      if (keys.length) {
        const values = [];
        const setSql = keys.map((k, idx) => {
          values.push(patch[k]);
          return `${k} = $${idx + 1}`;
        });
        values.push(row.id);
        await pool.query(`update papers set ${setSql.join(", ")} where id = $${values.length}`, values);
      }
    }
    console.log(`Blob migration complete. Uploaded objects: ${uploaded}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
