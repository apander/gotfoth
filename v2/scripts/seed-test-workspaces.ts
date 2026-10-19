import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { seedTestFixtures } from "../src/server/test-fixtures";
import { testAccounts, testFamilyIds } from "../src/lib/test-accounts";
import { requireNeonUrl } from "../src/lib/neon-url";
const apply = process.argv.includes("--apply"),
  reset = process.argv.includes("--reset"),
  main = process.argv.includes("--main");
const owner = parseEnv(
    readFileSync(
      main ? ".env.production-operator" : ".env.persona-preview-operator",
      "utf8",
    ),
  ),
  runtime = parseEnv(
    readFileSync(
      main ? ".env.production-deploy" : ".env.persona-preview",
      "utf8",
    ),
  );
const adminURL = new URL(
    requireNeonUrl(owner.DATABASE_ADMIN_URL!, "Database owner"),
  ),
  runtimeURL = new URL(runtime.DATABASE_URL!);
if (
  runtimeURL.pathname !== adminURL.pathname ||
  adminURL.hostname.replace("-pooler", "") !==
    runtimeURL.hostname.replace("-pooler", "") ||
  new URL(runtime.BETTER_AUTH_URL!).protocol !== "https:"
)
  throw new Error(
    "The fixture owner and runtime configuration must point to the same database.",
  );
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    reset,
    accounts: testAccounts.length,
    families: Object.keys(testFamilyIds),
    target: main ? "main" : "preview",
    targetDatabase: adminURL.pathname.slice(1),
    googleBypass: "seeded test accounts only",
  }),
);
if (apply) {
  const directoryFile = "../.vercel/persona-test-accounts.json";
  const pool = new Pool({ connectionString: adminURL.toString() }),
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(820025)");
    const target = (
      await client.query(
        "SELECT current_database() AS name,current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='submissions'::regclass",
      )
    ).rows[0];
    if (
      target.name !== decodeURIComponent(adminURL.pathname.slice(1)) ||
      !target.owner
    )
      throw new Error(
        "Fixture setup requires the configured database owner connection.",
      );
    const summary = await seedTestFixtures(client, reset);
    await client.query("COMMIT");
    writeFileSync(
      directoryFile,
      JSON.stringify(
        {
          url: new URL("/testing", runtime.BETTER_AUTH_URL).toString(),
          accounts: testAccounts,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        ...summary,
        directoryFile: ".vercel/persona-test-accounts.json",
      }),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
