import assert from "node:assert/strict";
import test from "node:test";
import { requireNeonUrl } from "../src/lib/neon-url";

const hosted =
  "postgresql://app:secret@ep-example.eu-central-1.aws.neon.tech/study_vault_v2?sslmode=require";

test("database connections must use Neon", () => {
  assert.equal(requireNeonUrl(hosted, "DATABASE_URL"), hosted);
  assert.throws(() => requireNeonUrl("postgresql://postgres@127.0.0.1/study_vault_v2", "DATABASE_URL"));
  assert.throws(() => requireNeonUrl("postgresql://postgres@localhost/study_vault_v2", "DATABASE_URL"));
});
