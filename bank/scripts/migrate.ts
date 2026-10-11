import { readdir, readFile } from "node:fs/promises";
import { connect } from "../src/lib/env";

const client = await connect("PAPER_BANK_URL");
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const directory = new URL("../drizzle/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    const id = name.replace(/\.sql$/, "");
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id]);
    if (applied.rowCount) {
      console.log(`${id} already applied.`);
      continue;
    }
    const sql = await readFile(new URL(name, directory), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
      console.log(`Applied ${id}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
