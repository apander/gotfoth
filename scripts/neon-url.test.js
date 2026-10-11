const assert = require("node:assert/strict");
const test = require("node:test");
const { requireNeonUrl } = require("./neon-url");

const hosted = "postgresql://app:secret@ep-example.eu-central-1.aws.neon.tech/gotfoth?sslmode=require";

test("database connections must use Neon", () => {
  assert.equal(requireNeonUrl(hosted, "NEON_DATABASE_URL"), hosted);
  assert.throws(() => requireNeonUrl("postgresql://postgres@127.0.0.1/gotfoth", "NEON_DATABASE_URL"));
  assert.throws(() => requireNeonUrl("postgresql://postgres@localhost/gotfoth", "NEON_DATABASE_URL"));
  const verified = hosted.replace("sslmode=require", "sslmode=verify-full");
  assert.equal(requireNeonUrl(verified, "NEON_DATABASE_URL"), verified);
});
