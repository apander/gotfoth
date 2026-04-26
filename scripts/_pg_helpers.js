#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function optionalEnv(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : String(v);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupDir() {
  const out = optionalEnv("BACKUP_DIR", path.resolve(process.cwd(), "backups"));
  fs.mkdirSync(out, { recursive: true });
  return out;
}

function binTool(name) {
  const pgBin = optionalEnv("PG_BIN_DIR", "").trim();
  if (!pgBin) return name;
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(pgBin, `${name}${ext}`);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function pgDump(dbUrl, outFile) {
  await run(binTool("pg_dump"), [
    `--dbname=${dbUrl}`,
    "--format=custom",
    `--file=${outFile}`,
    "--no-owner",
    "--no-privileges",
    "--verbose",
  ]);
}

async function pgRestore(dbUrl, dumpFile) {
  await run(binTool("pg_restore"), [
    `--dbname=${dbUrl}`,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--verbose",
    dumpFile,
  ]);
}

module.exports = {
  requireEnv,
  optionalEnv,
  timestamp,
  backupDir,
  pgDump,
  pgRestore,
};
