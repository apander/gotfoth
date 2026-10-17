/**
 * Dry-run by default. Apply only after approving the isolated preview resources.
 * Reads ignored local configuration; never prints credentials.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { requireNeonUrl } from "../src/lib/neon-url";

const databaseName = "gotfoth_persona_preview";
const runtimeRole = "gotfoth_persona_preview_runtime";
const branch = "codex/persona-experiences";
const previewURL = "https://gotfoth-persona-preview.vercel.app";
const runtimeFile = ".env.persona-preview";
const operatorFile = ".env.persona-preview-operator";
const apply = process.argv.slice(2).includes("--apply");
const read = (path: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(parseEnv(readFileSync(path, "utf8"))).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string>;
const destination = (value: string) => {
  const url = new URL(requireNeonUrl(value, "Preview database"));
  return url.hostname.replace("-pooler", "") + url.pathname;
};
const dev = read(".env.development-archive");
const operator = read(".env.operator.local");
const production = read(".env.production-deploy");
if (
  destination(dev.DATABASE_URL) === destination(production.DATABASE_URL) ||
  destination(dev.DATABASE_URL) !== destination(operator.DATABASE_ADMIN_URL)
)
  throw new Error(
    "Development, operator and production isolation check failed.",
  );
if (!dev.GOOGLE_CLIENT_ID || !dev.GOOGLE_CLIENT_SECRET || !dev.SUPERUSER_EMAIL)
  throw new Error(
    "The existing development Google configuration is incomplete.",
  );

const owner = new Pool({ connectionString: operator.DATABASE_ADMIN_URL });
try {
  const existingDatabase = await owner.query(
    "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
    [databaseName],
  );
  const existingRole = await owner.query(
    "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1",
    [runtimeRole],
  );
  const localFiles = existsSync(runtimeFile) && existsSync(operatorFile);
  if (existsSync(runtimeFile) !== existsSync(operatorFile))
    throw new Error(
      "Incomplete local preview configuration; inspect it before continuing.",
    );
  if ((existingDatabase.rowCount || existingRole.rowCount) && !localFiles)
    throw new Error(
      "Preview resources already exist without matching local configuration.",
    );
  if (
    existingDatabase.rows[0] &&
    existingDatabase.rows[0].owner !==
      new URL(operator.DATABASE_ADMIN_URL).username
  )
    throw new Error("The existing preview database has a different owner.");
  if (existingRole.rows[0] && Object.values(existingRole.rows[0]).some(Boolean))
    throw new Error("The existing preview runtime role has unsafe privileges.");

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        developmentDestinationFingerprint: createHash("sha256")
          .update(destination(dev.DATABASE_URL))
          .digest("hex")
          .slice(0, 12),
        isolatedFromProduction: true,
        database: databaseName,
        runtimeRole,
        branch,
        previewURL,
        createDatabase: !existingDatabase.rowCount,
        createRuntimeRole: !existingRole.rowCount,
        migrate: "0000_v2 through 0006_persona_goals",
        localFiles: [runtimeFile, operatorFile],
        deployEnvironment: "Preview, dedicated branch only",
      },
      null,
      2,
    ),
  );
  if (apply) {
    let runtime: Record<string, string>,
      previewOperator: Record<string, string>;
    if (localFiles) {
      runtime = read(runtimeFile);
      previewOperator = read(operatorFile);
    } else {
      const adminURL = new URL(operator.DATABASE_ADMIN_URL);
      adminURL.pathname = `/${databaseName}`;
      const runtimeURL = new URL(dev.DATABASE_URL);
      runtimeURL.pathname = `/${databaseName}`;
      runtimeURL.username = runtimeRole;
      runtimeURL.password = randomBytes(32).toString("hex");
      runtime = {
        DATABASE_URL: runtimeURL.toString(),
        BETTER_AUTH_URL: previewURL,
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        GOOGLE_CLIENT_ID: dev.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: dev.GOOGLE_CLIENT_SECRET,
        SUPERUSER_EMAIL: dev.SUPERUSER_EMAIL,
        TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
        CRON_SECRET: randomBytes(32).toString("hex"),
        PAYMENTS_ENABLED: "false",
        GLOBAL_AI_BUDGET_MICROS: "0",
      };
      previewOperator = { DATABASE_ADMIN_URL: adminURL.toString() };
      const save = (path: string, values: Record<string, string>) =>
        writeFileSync(
          path,
          Object.entries(values)
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join("\n") + "\n",
          { mode: 0o600, flag: "wx" },
        );
      save(runtimeFile, runtime);
      save(operatorFile, previewOperator);
    }
    const runtimeURL = new URL(runtime.DATABASE_URL);
    const previewAdminURL = new URL(previewOperator.DATABASE_ADMIN_URL);
    if (
      runtimeURL.pathname !== `/${databaseName}` ||
      runtimeURL.username !== runtimeRole ||
      previewAdminURL.pathname !== `/${databaseName}` ||
      destination(runtime.DATABASE_URL) !==
        destination(previewOperator.DATABASE_ADMIN_URL) ||
      runtimeURL.hostname.replace("-pooler", "") !==
        new URL(dev.DATABASE_URL).hostname.replace("-pooler", "") ||
      previewAdminURL.username !==
        new URL(operator.DATABASE_ADMIN_URL).username ||
      !/^[0-9a-f]{64}$/.test(decodeURIComponent(runtimeURL.password))
    )
      throw new Error(
        "Saved preview configuration does not match the approved isolated target.",
      );
    if (!existingDatabase.rowCount)
      await owner.query(`CREATE DATABASE ${databaseName}`);
    if (!existingRole.rowCount)
      await owner.query(
        `CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${decodeURIComponent(runtimeURL.password)}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
      );
    process.env.DATABASE_ADMIN_URL = previewOperator.DATABASE_ADMIN_URL;
    await import("./migrate");
    const previewOwner = new Pool({
      connectionString: previewOperator.DATABASE_ADMIN_URL,
    });
    try {
      await previewOwner.query(`
        GRANT CONNECT ON DATABASE ${databaseName} TO ${runtimeRole};
        GRANT USAGE ON SCHEMA public, paper_bank TO ${runtimeRole};
        GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public, paper_bank TO ${runtimeRole};
        GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public, paper_bank TO ${runtimeRole};
        REVOKE ALL ON v2_migrations FROM ${runtimeRole};
        REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      `);
      console.log(
        "Isolated preview schema and restricted runtime grants are ready. No deployment was changed.",
      );
    } finally {
      await previewOwner.end();
    }
  }
} finally {
  await owner.end();
}
