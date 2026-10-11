import "server-only";
import { Pool, type PoolClient } from "pg";

const state = globalThis as typeof globalThis & { __paperBankPool?: Pool };

export function database() {
  const connectionString = process.env.PAPER_BANK_URL;
  if (!connectionString) throw new Error("PAPER_BANK_URL is not set.");
  if (state.__paperBankPool) return state.__paperBankPool;
  const created = new Pool({ connectionString, max: 1 });
  created.on("error", () => {
    if (state.__paperBankPool === created) state.__paperBankPool = undefined;
    void created.end().catch(() => undefined);
  });
  state.__paperBankPool = created;
  return created;
}

export function resetDatabase() {
  const dead = state.__paperBankPool;
  state.__paperBankPool = undefined;
  void dead?.end().catch(() => undefined);
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
