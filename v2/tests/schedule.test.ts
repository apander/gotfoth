import test from "node:test";
import assert from "node:assert/strict";
import {
  availabilityFromCells,
  cellsFromAvailability,
  clearBlock,
} from "../src/components/schedule-fields";

test("a twenty minute evening covers the half hour that contains it", () => {
  const cells = cellsFromAvailability([{ day: 1, start: "17:00", minutes: 20 }]);
  assert.deepEqual([...cells], ["1-20"]);
});

test("a dragged range becomes one slot per day and keeps gaps separate", () => {
  assert.deepEqual(
    availabilityFromCells(["1-20", "1-21", "1-23", "4-20"]),
    [
      { day: 1, start: "17:00", minutes: 60 },
      { day: 1, start: "18:30", minutes: 30 },
      { day: 4, start: "17:00", minutes: 30 },
    ],
  );
});

test("clicking a block clears that day's whole run", () => {
  const next = clearBlock(new Set(["1-20", "1-21", "4-20"]), 1, 21);
  assert.deepEqual([...next].sort(), ["4-20"]);
});
