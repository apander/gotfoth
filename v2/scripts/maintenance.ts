import { Pool } from "pg";
import { list, del } from "@vercel/blob";
import { purgeFamily } from "../src/server/privacy";
import { requireNeonUrl } from "../src/lib/neon-url";
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("Owner connection required for retention maintenance.");
const pool = new Pool({
  connectionString: requireNeonUrl(process.env.DATABASE_ADMIN_URL, "DATABASE_ADMIN_URL"),
});
try {
  const families = (
    await pool.query(
      "SELECT id FROM families WHERE deleted_at IS NOT NULL AND name<>'Deleted family'",
    )
  ).rows;
  for (const family of families) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await purgeFamily(client, family.id);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.query(
    "DELETE FROM audit_events WHERE created_at<now()-interval '30 days'",
  );
  await pool.query(
    "DELETE FROM outbox WHERE state='done' AND created_at<now()-interval '30 days'",
  );
  await pool.query('DELETE FROM verification WHERE "expiresAt"<now()');
  // Encrypted backups are private operator assets. Retain 30 days, including after application deletion.
  if (process.env.BACKUP_BLOB_READ_WRITE_TOKEN) {
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: "v2-backups/",
        cursor,
        token: process.env.BACKUP_BLOB_READ_WRITE_TOKEN,
      });
      for (const blob of page.blobs)
        if (new Date(blob.uploadedAt).getTime() < Date.now() - 30 * 86400000)
          await del(blob.url, {
            token: process.env.BACKUP_BLOB_READ_WRITE_TOKEN,
          });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  console.log(
    `Maintenance complete. Purged ${families.length} requested families.`,
  );
} finally {
  await pool.end();
}
