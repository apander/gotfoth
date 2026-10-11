#!/usr/bin/env node
/* eslint-disable no-console */

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const APP_BASE_URL = requireEnv("APP_BASE_URL").replace(/\/$/, "");

async function main() {
  console.log(`Smoke-checking ${APP_BASE_URL}`);
  const res = await fetch(APP_BASE_URL);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${APP_BASE_URL}`);
  if (!body.includes("GotFoth"))
    throw new Error("Production page did not serve the GotFoth app.");
  console.log("Smoke-check complete.");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
