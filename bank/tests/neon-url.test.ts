import assert from "node:assert/strict";
import test from "node:test";
import { requireNeonUrl } from "../src/lib/neon-url";

const hosted =
  "postgresql://app:secret@ep-example.eu-central-1.aws.neon.tech/paper_bank?sslmode=require";

test("database connections must use Neon", () => {
  assert.equal(requireNeonUrl(hosted, "PAPER_BANK_URL"), hosted);
  assert.throws(() =>
    requireNeonUrl("postgresql://postgres:postgres@127.0.0.1:5438/postgres", "PAPER_BANK_URL"),
  );
  assert.throws(() =>
    requireNeonUrl("postgresql://postgres:postgres@localhost/postgres", "PAPER_BANK_URL"),
  );
  assert.throws(() =>
    requireNeonUrl(
      "postgresql://app:secret@ep-example.eu-central-1.aws.neon.tech/paper_bank",
      "PAPER_BANK_URL",
    ),
  );
});
