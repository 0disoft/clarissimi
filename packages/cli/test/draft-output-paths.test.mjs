import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

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
  return { exitCode, stdout, stderr };
}

async function approveDraft(dir, draftPath) {
  const draft = JSON.parse(
    await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
  );
  draft.maintainerApprovalStatus = "draft";
  delete draft.approvalSnapshot;
  await mkdir(dirname(draftPath), { recursive: true });
  await writeFile(draftPath, JSON.stringify(draft), "utf8");
  const approved = await run(["approve-draft", "--draft", draftPath, "--json"], dir);
  assert.equal(approved.exitCode, 0, approved.stdout + approved.stderr);
  return readFile(draftPath, "utf8");
}

for (const [draftName, outDir] of [
  ["CONTRIBUTORS.md", "."],
  [".clarissimi/contributors.json", "."],
  [".clarissimi/static/contributions.json", "."],
  ["rendered/.clarissimi/contributions.jsonl", "rendered"],
]) {
  test(`import-draft preserves its approved source at ${draftName}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-draft-output-collision-"));
    try {
      const draftPath = join(dir, draftName);
      const before = await approveDraft(dir, draftPath);
      const ledgerPath = join(dir, ".clarissimi", "contributions.jsonl");
      await mkdir(dirname(ledgerPath), { recursive: true });
      await writeFile(ledgerPath, "\n", "utf8");

      const result = await run(
        ["import-draft", "--draft", draftPath, "--out-dir", outDir, "--json"],
        dir,
      );

      assert.equal(result.exitCode, 1, result.stdout + result.stderr);
      assert.match(JSON.parse(result.stdout).message, /output path overlaps the reviewed draft/);
      assert.equal(await readFile(draftPath, "utf8"), before);
      assert.equal(await readFile(ledgerPath, "utf8"), "\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("import-draft preserves an approved source reached through a directory alias", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-draft-output-alias-"));
  try {
    const draftPath = join(dir, ".clarissimi", "static", "contributions.json");
    const before = await approveDraft(dir, draftPath);
    const ledgerPath = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(ledgerPath, "\n", "utf8");
    await symlink(dirname(draftPath), join(dir, "reviewed"), "junction");
    const aliasPath = join(dir, "reviewed", "contributions.json");

    const result = await run(
      ["import-draft", "--draft", aliasPath, "--out-dir", ".", "--json"],
      dir,
    );

    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).message, /output path overlaps the reviewed draft/);
    assert.equal(await readFile(aliasPath, "utf8"), before);
    assert.equal(await readFile(ledgerPath, "utf8"), "\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
