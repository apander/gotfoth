import test from "node:test";
import assert from "node:assert/strict";
import { examSessionChoices } from "../src/lib/sessions";

test("exam sessions start at the current sitting and stop two years ahead", () => {
  assert.deepEqual(examSessionChoices(new Date(2026, 9, 12)), [
    "October 2026",
    "January 2027",
    "June 2027",
    "October 2027",
    "January 2028",
    "June 2028",
    "October 2028",
  ]);
});

test("a sitting earlier in the same year is not offered", () => {
  assert.deepEqual(examSessionChoices(new Date(2026, 5, 2))[0], "June 2026");
  assert.equal(
    examSessionChoices(new Date(2026, 5, 2)).includes("January 2026"),
    false,
  );
});
