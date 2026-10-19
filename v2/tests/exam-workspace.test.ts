import test from "node:test";
import assert from "node:assert/strict";
import {
  newExamWorkspace,
  readExamWorkspace,
} from "../src/components/exam-workspace-state";
import { questionSources } from "../src/components/exam-sources";

test("workspace recovery rejects damaged preferences and bounds optional reading state", () => {
  assert.deepEqual(readExamWorkspace("invalid"), newExamWorkspace());
  assert.deepEqual(readExamWorkspace('{"version":2}'), newExamWorkspace());
  const state = readExamWorkspace(
    JSON.stringify({
      version: 1,
      width: 500,
      view: "unexpected",
      question: "q2",
      sources: {
        selected: "source",
        readers: {
          source: {
            top: -1,
            zoom: 0.01,
            fit: "page",
            highlights: {
              p1: [{ start: 2, end: 9 }, { start: -2, end: 9 }, null],
            },
          },
        },
        pin: {
          source: "source",
          block: "p1",
          parts: [{ block: "p1", start: 2, end: 9 }],
        },
      },
      answers: { q2: { top: 100, start: 20, end: 21, direction: "backward" } },
    }),
  );
  assert.equal(state.width, 65);
  assert.equal(state.view, "source");
  assert.equal(state.sources.readers.source.top, 0);
  assert.equal(state.sources.readers.source.zoom, 1);
  assert.equal(state.sources.readers.source.fit, "page");
  assert.deepEqual(state.sources.readers.source.highlights?.p1, [
    { start: 2, end: 9 },
  ]);
  assert.equal(state.sources.pin?.parts?.[0].end, 9);
  assert.equal(state.answers.q2.start, 20);
});

test("shared source identities survive subquestions without exposing unrelated material", () => {
  const extract = { label: "A", text: "Original evidence.\nSecond paragraph." };
  const resources = [
    {
      id: "r1",
      title: "Case study",
      text: "The original case.",
      table: {
        caption: "Table 1",
        columns: ["Year", "Value"],
        rows: [["2025", "12"]],
      },
    },
    { id: "r2", title: "Unrelated", text: "Hidden evidence" },
  ];
  const first = questionSources(
    {
      id: "q1",
      extracts: [extract, { label: "B", text: "Hidden", cited: false }],
      resourceIds: ["r1"],
    },
    resources,
  );
  const second = questionSources(
    { id: "q2", extracts: [extract], resourceIds: ["r1"] },
    resources,
  );
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(first[2].label, "Table 1");
  assert.ok(!JSON.stringify(first).includes("Hidden"));
  const changed = questionSources(
    { extracts: [{ ...extract, text: "Different Extract A" }] },
    [],
  );
  assert.notEqual(first[0].key, changed[0].key);
  assert.deepEqual(questionSources({ resourceIds: [] }, resources), []);
});
