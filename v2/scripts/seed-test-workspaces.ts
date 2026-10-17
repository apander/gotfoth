import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { seedTestFixtures } from "../src/server/test-fixtures";
import { testAccounts, testFamilyIds } from "../src/lib/test-accounts";
import { requireNeonUrl } from "../src/lib/neon-url";
const apply = process.argv.includes("--apply"),
  reset = process.argv.includes("--reset");
const owner = parseEnv(readFileSync(".env.persona-preview-operator", "utf8")),
  runtime = parseEnv(readFileSync(".env.persona-preview", "utf8"));
const adminURL = new URL(
    requireNeonUrl(owner.DATABASE_ADMIN_URL!, "Preview owner"),
  ),
  runtimeURL = new URL(runtime.DATABASE_URL!);
if (
  adminURL.pathname !== "/gotfoth_persona_preview" ||
  runtimeURL.pathname !== adminURL.pathname ||
  adminURL.hostname.replace("-pooler", "") !==
    runtimeURL.hostname.replace("-pooler", "") ||
  runtime.BETTER_AUTH_URL !== "https://gotfoth-persona-preview.vercel.app"
)
  throw new Error(
    "Test fixtures are restricted to the isolated persona preview database.",
  );
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    reset,
    accounts: testAccounts.length,
    families: Object.keys(testFamilyIds),
    targetDatabase: "gotfoth_persona_preview",
    googleBypass: "seeded test accounts only",
  }),
);
if (apply) {
  const credentialsFile = "../.vercel/persona-test-logins.json";
  const saved = existsSync(credentialsFile)
    ? JSON.parse(readFileSync(credentialsFile, "utf8"))
    : null;
  const password =
    saved?.password ?? `UX-${randomBytes(18).toString("base64url")}`;
  if (typeof password !== "string" || password.length < 16)
    throw new Error("Invalid saved test password.");
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
    if (target.name !== "gotfoth_persona_preview" || !target.owner)
      throw new Error(
        "Fixture setup requires the isolated preview owner connection.",
      );
    const summary = await seedTestFixtures(
      client,
      await hashPassword(password),
      reset,
    );
    await client.query("COMMIT");
    writeFileSync(
      credentialsFile,
      JSON.stringify(
        {
          url: "https://gotfoth-persona-preview.vercel.app/testing",
          password,
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
        credentialFile: ".vercel/persona-test-logins.json",
        passwordPrinted: false,
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
