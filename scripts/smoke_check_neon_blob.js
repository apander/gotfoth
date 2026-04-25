#!/usr/bin/env node
/* eslint-disable no-console */

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const APP_BASE_URL = requireEnv("APP_BASE_URL").replace(/\/$/, "");

async function expectJson(url) {
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url} ${body}`);
  try {
    return JSON.parse(body);
  } catch (_e) {
    throw new Error(`Expected JSON from ${url}, got: ${body.slice(0, 200)}`);
  }
}

async function main() {
  console.log(`Smoke-checking ${APP_BASE_URL}`);
  const health = await expectJson(`${APP_BASE_URL}/api/health`);
  if (!health || health.ok !== true) throw new Error("Health check failed.");
  const papers = await expectJson(`${APP_BASE_URL}/api/collections/papers/records?perPage=3`);
  const boundaries = await expectJson(`${APP_BASE_URL}/api/collections/boundaries/records`);
  const settings = await expectJson(`${APP_BASE_URL}/api/collections/settings/records?perPage=3`);
  console.log(`health: ok`);
  console.log(`papers: ${Array.isArray(papers.items) ? papers.items.length : 0} rows`);
  console.log(`boundaries: ${Array.isArray(boundaries.items) ? boundaries.items.length : 0} rows`);
  console.log(`settings: ${Array.isArray(settings.items) ? settings.items.length : 0} rows`);
  console.log("Smoke-check complete.");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
