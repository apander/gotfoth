function requireNeonUrl(connectionString, name) {
  let url;
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
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode !== "require" && sslmode !== "verify-ca" && sslmode !== "verify-full") {
    throw new Error(`${name} must include sslmode=require, verify-ca, or verify-full.`);
  }
  return connectionString;
}

module.exports = { requireNeonUrl };
