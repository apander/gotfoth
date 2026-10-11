export function requireNeonUrl(connectionString: string, name: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${name} must be a Neon Postgres connection string.`);
  }
  const host = url.hostname.toLowerCase();
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local");
  if (local || !host.endsWith(".neon.tech")) {
    throw new Error(`${name} must be a Neon database. This project does not use a local database.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must be a Postgres connection string.`);
  }
  if (url.searchParams.get("sslmode") !== "require") {
    throw new Error(`${name} must include sslmode=require.`);
  }
  return connectionString;
}
