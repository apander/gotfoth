import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { requireNeonUrl } from "../src/lib/neon-url";
const connectionString = process.env.DATABASE_ADMIN_URL
  ? requireNeonUrl(process.env.DATABASE_ADMIN_URL, "DATABASE_ADMIN_URL")
  : process.env.DATABASE_ADMIN_URL;
if (!connectionString)
  throw new Error(
    "Set DATABASE_ADMIN_URL to the new v2 database owner connection.",
  );
const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(820024)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS v2_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  const migrations = [
    "0000_v2",
    "0001_teacher",
    "0002_superusers",
    "0003_paper_pdf",
    "0004_one_student_family",
    "0005_people_names",
  ];
  for (const name of migrations) {
    const done = await client.query(
      "SELECT name FROM v2_migrations WHERE name=$1",
      [name],
    );
    if (done.rows.length) continue;
    if (name === "0000_v2") {
      const legacy = await client.query(
        "SELECT to_regclass('public.papers') AS legacy",
      );
      if (legacy.rows[0].legacy)
        throw new Error("Refusing to install v2 in a v1 database.");
    }
    await drizzle(client).execute(
      sql.raw(
        await readFile(
          new URL(`../drizzle/${name}.sql`, import.meta.url),
          "utf8",
        ),
      ),
    );
    await client.query("INSERT INTO v2_migrations(name) VALUES($1)", [name]);
  }
  await client.query("COMMIT");
  console.log(
    "V2 schema is current. Configure a restricted runtime role before serving traffic.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
