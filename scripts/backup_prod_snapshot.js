#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
const { requireEnv, timestamp, backupDir, pgDump } = require("./_pg_helpers");

async function main() {
  const prodUrl = requireEnv("PROD_NEON_DATABASE_URL");
  const outDir = backupDir();
  const file = path.join(outDir, `prod-snapshot-${timestamp()}.dump`);
  console.log(`Creating prod snapshot: ${file}`);
  await pgDump(prodUrl, file);
  console.log("Prod snapshot completed.");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
