import assert from "node:assert/strict";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function withDraft(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-approval-paths-"));
  try {
    const assessment = JSON.parse(
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
    );
    assessment.maintainerApprovalStatus = "draft";
    const draftPath = join(dir, "draft.json");
    const original = JSON.stringify(assessment);
    await writeFile(draftPath, original);
    await callback({ dir, draftPath, original });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function approve(path, cwd) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(["approve-draft", "--draft", path, "--json"], {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  assert.equal(stderr, "");
  return { exitCode, output: JSON.parse(stdout) };
}

test("approval through a file symlink updates its target and preserves the link", async (context) => {
  await withDraft(async ({ dir, draftPath }) => {
    const alias = join(dir, "draft-alias.json");
    try {
      await symlink(draftPath, alias, "file");
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        context.skip("File symlinks require Windows developer mode or symlink privileges.");
        return;
      }
      throw error;
    }
    const canonical = await realpath(draftPath);
    const result = await approve(alias, dir);
    assert.equal(result.exitCode, 0, result.output.message);
    assert.equal(
      JSON.parse(await readFile(draftPath, "utf8")).maintainerApprovalStatus,
      "approved",
    );
    assert.equal(result.output.approvedDraftPath, canonical);
    assert.equal((await lstat(alias)).isSymbolicLink(), true);
    assert.equal(await readFile(alias, "utf8"), await readFile(draftPath, "utf8"));
  });
});

test("approval refuses a hard-linked draft without changing either alias", async () => {
  await withDraft(async ({ dir, draftPath, original }) => {
    const alias = join(dir, "draft-alias.json");
    await link(draftPath, alias);
    for (const selected of [draftPath, alias]) {
      const result = await approve(selected, dir);
      assert.equal(result.exitCode, 7, result.output.message);
      assert.equal(result.output.ok, false);
      assert.match(result.output.message, /multiple hard links/);
      assert.equal(await readFile(draftPath, "utf8"), original);
      assert.equal(await readFile(alias, "utf8"), original);
    }
  });
});

test("approval through a directory alias reports the canonical draft path", async () => {
  await withDraft(async ({ dir, draftPath }) => {
    const reviews = join(dir, "reviews");
    const alias = join(dir, "reviews-alias");
    await mkdir(reviews);
    const target = join(reviews, "draft.json");
    await writeFile(target, await readFile(draftPath));
    await symlink(reviews, alias, process.platform === "win32" ? "junction" : "dir");
    const result = await approve(join(alias, "draft.json"), dir);
    assert.equal(result.exitCode, 0, result.output.message);
    assert.equal(result.output.approvedDraftPath, await realpath(target));
    assert.equal(JSON.parse(await readFile(target, "utf8")).maintainerApprovalStatus, "approved");
  });
});
