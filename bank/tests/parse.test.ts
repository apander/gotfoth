import assert from "node:assert/strict";
import { test } from "node:test";
import { figureClip } from "../src/lib/figures";
import { paperLabel } from "../src/lib/labels";
import { expandLetters, reflowRows, textLines, textRows } from "../src/lib/lines";
import { pairFiles, parsePair } from "../src/lib/parse-pair";
import { parseMarkScheme } from "../src/lib/parse-scheme";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

test("answer-box symbols are left out of the question text", () => {
  const lines = textLines([
    { str: "\uF0A2", transform: [0, 0, 0, 0, 10, 100] },
    { str: "Explain one benefit.", transform: [0, 0, 0, 0, 40, 100] },
    { str: "\uF0A2", transform: [0, 0, 0, 0, 10, 80] },
    { str: "\uF0A2", transform: [0, 0, 0, 0, 24, 80] },
  ]);
  assert.deepEqual(lines, ["Explain one benefit."]);
});

test("mark-scheme column headers are not stored as credit", () => {
  const parsed = parseMarkScheme([
    {
      page: 1,
      lines: [
        "1(b) Knowledge 1, Application 2, Analysis 1",
        "Knowledge",
        "for knowledge of quantitative market research data",
        "Analysis",
        "Timpson can analyse the ratings.",
        "Indicative content Mark",
        "Number",
      ],
    },
  ]);
  const item = parsed.items.get("1b");
  assert.ok(item);
  assert.equal(item.style, "points");
  assert.equal(
    item.credits.find((credit) => credit.strand === "analysis")?.examples,
    "Timpson can analyse the ratings.",
  );
});

test("star-rating counts stay while margin line numbers are dropped", () => {
  const rows = textRows(
    [
      { str: "3-star", transform: [0, 0, 0, 0, 128, 600] },
      { str: "86", transform: [0, 0, 0, 0, 505, 600] },
      { str: "strikes.", transform: [0, 0, 0, 0, 71, 580] },
      { str: "10", transform: [0, 0, 0, 0, 547, 580] },
    ],
    { dropLoneNumbers: true },
  );
  assert.deepEqual(
    rows.map((row) => row.text),
    ["3-star 86", "strikes."],
  );
});

test("source extract lines reflow into paragraphs without margin numbers", () => {
  const text = reflowRows([
    { y: 786, text: "Interview with James Timpson – Timpson’s chairman 2024" },
    { y: 762, text: "“I believe that if a business invests in colleagues, it can succeed. If you sat in one of our" },
    { y: 748, text: "board meetings you’d hear a lot about our colleagues’ happiness." },
    { y: 720, text: "put the money in the" },
    { y: 706, text: "till and look the part." },
    { y: 682, text: "Many businesses don’t realise that their most valuable asset isn’t the stock on the shelves," },
    { y: 640, text: "to higher sickness, low morale and even strikes." },
    { y: 616, text: "We paid for a garden play area." },
    { y: 514, text: "(Source: adapted from https://www.theguardian.com/commentisfree/2024/mar/05/burnt-" },
    { y: 502, text: "out-britain-workers-management-strike-sick and https://www.timpson-group." },
    { y: 490, text: "co.uk/timpson-foundation/ex-offenders/#:~:text=Approximately%2010%25%20" },
    { y: 478, text: "of%20our%20workforce)" },
  ]);
  assert.match(text, /money in the till and look the part\./);
  assert.match(text, /strikes\.\nWe paid/);
  assert.match(text, /burnt-out-britain/);
  assert.match(text, /timpson-group\.co\.uk/);
  assert.doesNotMatch(text, /\s(?:5|10|15)\b/);
  assert.equal(text.includes("\nboard"), false);
});

test("paper names use the year, subject, and paper", () => {
  assert.equal(
    paperLabel({ examDate: "2025-05-14", series: "Summer 2025", subject: "Business", code: "01" }),
    "2025 Business Paper 1",
  );
});

test("each extract is clipped to its own printed region", () => {
  const chart = figureClip(
    [
      { y: 762, left: 71, right: 160, text: "Extract A" },
      { y: 522, left: 201, right: 540, text: "(Source: adapted from the review page)" },
    ],
    [{ x0: 99, y0: 544, x1: 553, y1: 726 }],
  );
  assert.ok(chart);
  assert.ok(chart.y > 490);
  assert.ok(chart.y + chart.height > 760);
  assert.ok(chart.x + chart.width > 540);
  const prose = figureClip(
    [
      { y: 474, left: 71, right: 200, text: "Timpson Ltd" },
      { y: 408, left: 71, right: 520, text: "Timpson was established in 1865." },
    ],
    [{ x0: 99, y0: 544, x1: 553, y1: 726 }],
  );
  assert.ok(prose);
  assert.ok(prose.y + prose.height < 530);
});

test("extract letter ranges include the letters between the ends", () => {
  assert.deepEqual(expandLetters("A to D"), ["A", "B", "C", "D"]);
  assert.deepEqual(expandLetters("D, F and G"), ["D", "F", "G"]);
});

test("wrapped mark-scheme lines stay with the point they continue", () => {
  const parsed = parseMarkScheme([
    {
      page: 1,
      lines: [
        "1(c) Knowledge 2, Application 2, Analysis 3, Evaluation 3",
        "• A private limited company is a business owned by",
        "shareholders that have limited liability.",
        "Positive consequences of being a private limited",
        "company",
        "• The shareholders would gain limited liability.",
        "NB – Candidates could begin answer with potential",
        "negative consequences and counterbalance with",
        "positives",
        "Potential judgement",
        "• Remaining a private limited company would be natural.",
        "Level 4 7-10 Accurate and thorough.",
        "Question",
        "Indicative content Mark",
        "Number",
      ],
    },
  ]);
  const item = parsed.items.get("1c");
  assert.ok(item);
  assert.deepEqual(
    item.indicative.map((point) => point.role),
    ["definition", "application", "note", "judgement"],
  );
  assert.match(item.indicative[0]?.text ?? "", /owned by shareholders/);
  assert.equal(item.indicative[1]?.text, "The shareholders would gain limited liability.");
  assert.match(item.indicative[2]?.text ?? "", /counterbalance with positives/);
  assert.equal(item.bands.at(-1)?.max, 10);
  assert.equal(item.bands.at(-1)?.descriptor, "Accurate and thorough.");
});

const folder = "C:\\Users\\alasd\\Downloads";

test("Summer 2025 9BS0 papers reconcile", async (t) => {
  const names = await readdir(folder).catch(() => []);
  const pairs = pairFiles(names.map((name) => join(folder, name)));
  if (pairs.length < 3) {
    t.skip("source PDFs are not in Downloads");
    return;
  }
  for (const pair of pairs) {
    const paper = await parsePair(pair.question, pair.scheme);
    assert.equal(paper.issues.length, 0, paper.issues.join("\n"));
    assert.equal(
      paper.questions.reduce((sum, question) => sum + question.marks, 0),
      100,
    );
    assert.ok(paper.extracts.length >= 4);
    assert.equal(paper.durationMinutes, 120);
    for (const extract of paper.extracts) {
      assert.ok(
        extract.figures.length > 0 && extract.figures.every((figure) => figure.png.subarray(0, 4).toString("hex") === "89504e47"),
        `${paper.component} Extract ${extract.section}${extract.label} is not stored as printed`,
      );
    }
  }
});
