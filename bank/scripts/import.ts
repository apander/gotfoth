import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pairFiles, parsePair } from "../src/lib/parse-pair";
import { loadPaper } from "../src/lib/load";
import { connect } from "../src/lib/env";

const [stage, folder, ...flags] = process.argv.slice(2);
const reload = flags.includes("--reload");
if (!stage || !folder || !["inventory", "extract", "validate", "load"].includes(stage)) {
  throw new Error(
    "Usage: npm run import -- inventory|extract|validate|load <folder> [--reload]",
  );
}

const names = await readdir(folder);
const pdfs = names.filter((name) => name.toLowerCase().endsWith(".pdf")).map((name) => join(folder, name));
const pairs = pairFiles(pdfs);
if (pairs.length === 0) throw new Error("No 9BS0 question paper and mark scheme pairs were found.");

if (stage === "inventory") {
  for (const pair of pairs)
    console.log(`${pair.component}  question=${pair.question}  scheme=${pair.scheme}`);
  process.exit(0);
}

const papers = [];
for (const pair of pairs) papers.push(await parsePair(pair.question, pair.scheme));

if (stage === "extract" || stage === "validate") {
  let failed = false;
  for (const paper of papers) {
    console.log(`\n9BS0/${paper.component} ${paper.title} ${paper.examDate ?? ""}`);
    console.log(
      `questions=${paper.questions.length} extracts=${paper.extracts.map((extract) => extract.label).join("")} issues=${paper.issues.length}`,
    );
    for (const question of paper.questions) {
      const scheme = question.scheme;
      console.log(
        `  ${question.section} ${question.parent}(${question.part}) ${question.marks} ${question.command} ${question.format} ${scheme ? scheme.style : "missing"} ao=${scheme ? scheme.knowledge + scheme.application + scheme.analysis + scheme.evaluation : 0}`,
      );
    }
    for (const issue of paper.issues) {
      failed = true;
      console.log(`  ! ${issue}`);
    }
  }
  if (stage === "validate" && failed) process.exit(1);
  process.exit(0);
}

const client = await connect("PAPER_BANK_URL");
try {
  for (const paper of papers) {
    if (paper.issues.length) {
      console.log(`9BS0/${paper.component} was not loaded.`);
      for (const issue of paper.issues) console.log(`  ! ${issue}`);
      process.exitCode = 1;
      continue;
    }
    await client.query("BEGIN");
    const result = await loadPaper(client, paper, reload);
    await client.query("COMMIT");
    console.log(
      result.skipped
        ? `9BS0/${paper.component} unchanged`
        : `9BS0/${paper.component} loaded ${result.paperId}`,
    );
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
