import test from "node:test";
import assert from "node:assert/strict";
import {
  retrievalSchedule,
  type RetrievalEvidence,
} from "../src/lib/retrieval";
const evidence = (
  id: string,
  date: string,
  awarded: number,
  assisted = false,
): RetrievalEvidence => ({
  assessmentId: id,
  submittedAt: `2026-01-${date}T12:00:00.000Z`,
  specification: "2026",
  topics: ["evaluation"],
  awarded,
  available: 10,
  assisted,
  mode: "independent",
});
test("retrieval advances 3, 7, 21 days only with later independent success", () => {
  const tasks = retrievalSchedule([
    evidence("a", "01", 4),
    evidence("b", "04", 10, true),
    evidence("c", "05", 9),
    evidence("d", "12", 9),
  ]);
  assert.deepEqual(
    tasks.map((t) => t.intervalDays),
    [3, 7, 21],
  );
  assert.equal(tasks[0].completedAt, "2026-01-05T12:00:00.000Z");
  assert.equal(tasks[2].dueAt, "2026-02-02T12:00:00.000Z");
});
test("weak later evidence resets the interval and moderation recomputes the sequence", () => {
  const rows = [
    evidence("a", "01", 4),
    evidence("b", "04", 9),
    evidence("c", "11", 3),
  ];
  assert.deepEqual(
    retrievalSchedule(rows).map((t) => t.intervalDays),
    [3, 7, 3],
  );
  assert.equal(
    retrievalSchedule([
      { ...rows[0], awarded: 10 },
      { ...rows[1], awarded: 10 },
      { ...rows[2], awarded: 10 },
    ]).length,
    0,
  );
});
