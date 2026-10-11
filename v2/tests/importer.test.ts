import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
test("inventory reports corrupt documents and resumes duplicate detection without provider calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-vault-import-test-"));
  try {
    await writeFile(join(root, "WPS03-paper.pdf"), "This is not a valid PDF.");
    await writeFile(join(root, "duplicate.pdf"), "This is not a valid PDF.");
    await writeFile(join(root, "corrupt.pdf"), "Another corrupt source.");
    for (let run = 0; run < 2; run++) {
      await execute(
        process.execPath,
        ["--import", "tsx", "scripts/import.ts", "inventory", root],
        { cwd: resolve("."), windowsHide: true },
      );
      const report = JSON.parse(
        await readFile(join(root, ".import-cache", "report.json"), "utf8"),
      );
      assert.equal(report.documents, 3);
      assert.equal(report.duplicates, 1);
      assert.equal(report.budget.spent, 0);
      const inventory = JSON.parse(
        await readFile(join(root, ".import-cache", "inventory.json"), "utf8"),
      );
      assert.equal(
        inventory.filter((d: any) => d.status === "unreadable").length,
        2,
      );
    }
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe test cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
