import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function withDraft(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-workflow-output-"));
  try {
    const draft = JSON.parse(
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
    );
    draft.maintainerApprovalStatus = "draft";
    await writeFile(join(dir, "agent draft.json"), JSON.stringify(draft));
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function run(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  assert.equal(exitCode, 0, stdout + stderr);
  assert.equal(stderr, "");
  return stdout;
}

test("human draft workflow reports saved paths and rebuilds without importing twice", async () => {
  await withDraft(async (dir) => {
    const stagedPath = join(dir, "review inbox", "sample-project-merged_pull_request-42.json");
    const staged = await run(
      ["stage-draft", "--draft", "agent draft.json", "--drafts-dir", "review inbox"],
      dir,
    );
    assert.ok(staged.includes(stagedPath), staged);
    assert.equal(JSON.parse(await readFile(stagedPath, "utf8")).maintainerApprovalStatus, "draft");

    const approved = await run(["approve-draft", "--draft", stagedPath], dir);
    assert.ok(approved.includes(stagedPath), approved);
    assert.equal(
      JSON.parse(await readFile(stagedPath, "utf8")).maintainerApprovalStatus,
      "approved",
    );

    const ledgerPath = join(dir, "custom ledger.jsonl");
    const imported = await run(
      ["import-draft", "--draft", stagedPath, "--ledger", ledgerPath],
      dir,
    );
    assert.ok(imported.includes(ledgerPath), imported);
    assert.ok(
      imported.includes("clarissimi rebuild --ledger <ledger-path> --out-dir <output-dir>"),
    );
    assert.ok(!imported.includes("pass --out-dir"));

    const ledgerBefore = await readFile(ledgerPath, "utf8");
    await run(["rebuild", "--ledger", ledgerPath, "--out-dir", "public output"], dir);
    assert.equal(await readFile(ledgerPath, "utf8"), ledgerBefore);
    assert.ok(
      (await readFile(join(dir, "public output", "CONTRIBUTORS.md"), "utf8")).includes("octocat"),
    );
  });
});

test("JSON workflow remains one document with its existing path fields", async () => {
  await withDraft(async (dir) => {
    const staged = JSON.parse(
      await run(["stage-draft", "--draft", "agent draft.json", "--json"], dir),
    );
    assert.ok(staged.stagedDraftPath.startsWith(dir));
    assert.ok(!("humanDetails" in staged));
    const approved = JSON.parse(
      await run(["approve-draft", "--draft", staged.stagedDraftPath, "--json"], dir),
    );
    assert.equal(approved.approvedDraftPath, staged.stagedDraftPath);
    const imported = JSON.parse(
      await run(["import-draft", "--draft", approved.approvedDraftPath, "--json"], dir),
    );
    assert.ok(imported.ledgerPath.startsWith(dir));
    assert.equal(imported.wroteDerivedFiles, false);
    assert.ok(!("humanDetails" in imported));
  });
});
