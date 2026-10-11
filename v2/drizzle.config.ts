import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/schema.ts",
  out: "./drizzle/generated",
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? "" },
  strict: true,
});
