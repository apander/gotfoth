import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { requireNeonUrl } from "./neon-url";

export async function loadEnvFile() {
  if (process.env.PAPER_BANK_URL && process.env.PAPER_BANK_ADMIN_URL) return;
  try {
    const text = await readFile(new URL("../../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    // The shell may already have provided the variables.
  }
}

export async function connect(variable: "PAPER_BANK_URL" | "PAPER_BANK_ADMIN_URL") {
  await loadEnvFile();
  const connectionString = process.env[variable];
  if (!connectionString) throw new Error(`${variable} is not set.`);
  const client = new Client({
    connectionString: requireNeonUrl(connectionString, variable),
    options: "-c search_path=paper_bank,public",
  });
  await client.connect();
  return client;
}
