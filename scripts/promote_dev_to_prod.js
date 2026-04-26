#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
const { requireEnv, timestamp, backupDir, pgDump, pgRestore } = require("./_pg_helpers");

async function main() {
  const devUrl = requireEnv("DEV_NEON_DATABASE_URL");
  const prodUrl = requireEnv("PROD_NEON_DATABASE_URL");
  const outDir = backupDir();
  const prodBackupFile = path.join(outDir, `prod-pre-promote-${timestamp()}.dump`);
  const devExportFile = path.join(outDir, `dev-export-${timestamp()}.dump`);

  console.log("Step 1/3: Backup current prod database");
  await pgDump(prodUrl, prodBackupFile);

  console.log("Step 2/3: Dump dev database");
  await pgDump(devUrl, devExportFile);

  console.log("Step 3/3: Restore dev dump into prod");
  await pgRestore(prodUrl, devExportFile);

  console.log("Promotion completed (dev -> prod).");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
