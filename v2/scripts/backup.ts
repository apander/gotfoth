import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { requireNeonUrl } from "../src/lib/neon-url";
const [mode, path] = process.argv.slice(2);
const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? "", "base64");
if (key.length !== 32)
  throw new Error("Set a separate base64 32-byte BACKUP_ENCRYPTION_KEY.");
const raw =
  mode === "restore-test"
    ? process.env.RESTORE_TEST_DATABASE_URL
    : process.env.DATABASE_ADMIN_URL;
if (!raw)
  throw new Error(
    "Set the owner source connection or the isolated RESTORE_TEST_DATABASE_URL.",
  );
if (mode === "restore-test" && raw === process.env.DATABASE_ADMIN_URL)
  throw new Error("Refusing to restore over the source database.");
requireNeonUrl(raw, mode === "restore-test" ? "RESTORE_TEST_DATABASE_URL" : "DATABASE_ADMIN_URL");
const url = new URL(raw);
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
  PGSSLMODE: url.searchParams.get("sslmode") ?? "require",
};
const dir = await mkdtemp(join(tmpdir(), "study-vault-backup-")),
  dump = join(dir, "database.dump");
function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(command, args, {
      env,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    p.on("error", () => reject(new Error(`${command} is unavailable.`)));
    p.stderr.resume();
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} failed; inspect the database service without logging credentials.`,
            ),
          ),
    );
  });
}
try {
  if (mode === "restore-test") {
    if (!path) throw new Error("Supply a downloaded encrypted backup.");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: raw });
    try {
      const tables = await pool.query(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
      );
      if (Number(tables.rows[0].count) !== 0)
        throw new Error("Restore-test destination must be an empty database.");
    } finally {
      await pool.end();
    }
    const bytes = await readFile(path),
      decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    await writeFile(
      dump,
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]),
    );
    await run("pg_restore", [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      url.pathname.slice(1),
      dump,
    ]);
    const restored = new Pool({ connectionString: raw });
    try {
      const result = await restored.query(
        "SELECT (SELECT count(*) FROM v2_migrations) AS migrations,(SELECT count(*) FROM pg_trigger WHERE tgname='immutable_submissions') AS immutable,(SELECT relrowsecurity FROM pg_class WHERE oid='answers'::regclass) AS rls",
      );
      if (
        !result.rows[0].migrations ||
        !result.rows[0].immutable ||
        !result.rows[0].rls
      )
        throw new Error("Restored database did not pass integrity checks.");
    } finally {
      await restored.end();
    }
    console.log(
      "Isolated restore and schema integrity checks passed.",
    );
  } else if (mode === "create") {
    await run("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      dump,
    ]);
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      bytes = Buffer.concat([
        cipher.update(await readFile(dump)),
        cipher.final(),
      ]);
    const encrypted = Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    await put(
      `v2-backups/${new Date().toISOString().replaceAll(":", "-")}.dump.enc`,
      encrypted,
      {
        access: "private",
        token: process.env.BACKUP_BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
      },
    );
    console.log("Encrypted private backup uploaded.");
  } else
    throw new Error(
      "Usage: backup.ts create | restore-test <encrypted-backup-file>",
    );
} finally {
  const target = resolve(dir),
    root = resolve(tmpdir());
  if (
    !target.startsWith(root + sep) ||
    !basename(target).startsWith("study-vault-backup-")
  )
    throw new Error("Refusing cleanup outside the backup temporary directory.");
  await rm(target, { recursive: true, force: true });
}
