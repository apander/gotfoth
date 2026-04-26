#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
const { requireEnv, timestamp, backupDir, pgDump, pgRestore } = require("./_pg_helpers");

async function main() {
  const devUrl = requireEnv("DEV_NEON_DATABASE_URL");
  const prodUrl = requireEnv("PROD_NEON_DATABASE_URL");
  const outDir = backupDir();
  const devBackupFile = path.join(outDir, `dev-pre-refresh-${timestamp()}.dump`);
  const prodExportFile = path.join(outDir, `prod-export-${timestamp()}.dump`);

  console.log("Step 1/3: Backup current dev database");
  await pgDump(devUrl, devBackupFile);

  console.log("Step 2/3: Dump prod database");
  await pgDump(prodUrl, prodExportFile);

  console.log("Step 3/3: Restore prod dump into dev");
  await pgRestore(devUrl, prodExportFile);

  console.log("Refresh completed (prod -> dev).");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
