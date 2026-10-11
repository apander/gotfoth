import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Pool } from "pg";
import { requireNeonUrl } from "../src/lib/neon-url";

const folder = process.argv[2];
const connectionString = process.env.DATABASE_ADMIN_URL
  ? requireNeonUrl(process.env.DATABASE_ADMIN_URL, "DATABASE_ADMIN_URL")
  : "";
if (!folder || !connectionString)
  throw new Error("Usage: DATABASE_ADMIN_URL=... tsx scripts/store-paper-pdfs.ts <folder>");

const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  const names = (await readdir(folder)).filter((name) => name.toLowerCase().endsWith(".pdf"));
  for (const name of names) {
    const pdf = await readFile(join(folder, name));
    const updated = await client.query(
      "UPDATE paper_bank.source_files SET pdf = $1 WHERE lower(filename) = lower($2)",
      [pdf, basename(name)],
    );
    console.log(`${name}: ${updated.rowCount ?? 0} file rows`);
  }
} finally {
  client.release();
  await pool.end();
}
