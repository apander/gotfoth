import { connect } from "../src/lib/env";

const admin = await connect("PAPER_BANK_ADMIN_URL");
try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'paper_bank'");
  if (existing.rowCount) console.log("Database paper_bank already exists.");
  else {
    await admin.query("CREATE DATABASE paper_bank");
    console.log("Created database paper_bank.");
  }
} finally {
  await admin.end();
}
