import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";
import { parseJsonText } from "../dist/io.js";
import { parseContributionsJsonl } from "../../renderers/dist/index.js";

const bom = "\uFEFF";
const fixture = (name) => readFile(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8");

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-bom-input-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function run(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli([...argv, "--json"], {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  assert.equal(exitCode, 0, stdout + stderr);
  return JSON.parse(stdout);
}

test("JSON input accepts one leading BOM while preserving characters inside values", () => {
  assert.deepEqual(parseJsonText(`${bom}{"text":"before${bom}after"}`, "input.json"), {
    text: `before${bom}after`,
  });
  assert.throws(() => parseJsonText(`${bom}${bom}{}`, "input.json"), /Invalid JSON/);
});

test("validate-config accepts a BOM-prefixed JSON config", async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, "config.json"), `${bom}{"markdownSummary":"table"}`);
    await run(["validate-config", "--config", "config.json"], dir);
  });
});

for (const [flag, name] of [
  ["--fixture", "merged-pr-basic.json"],
  ["--github-fixture", "github-merged-pr-basic.json"],
]) {
  test(`recognize accepts BOM-prefixed ${flag} input`, async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "fixture.json"), bom + (await fixture(name)));
      const output = await run(["recognize", flag, "fixture.json"], dir);
      assert.equal(output.draftCreated, true);
    });
  });
}

test("BOM-prefixed drafts can be staged, approved, and imported without changing approval content", async () => {
  await withTempDir(async (dir) => {
    const draft = JSON.parse(await fixture("approved-draft.json"));
    draft.maintainerApprovalStatus = "draft";
    await writeFile(join(dir, "draft.json"), bom + JSON.stringify(draft));
    const staged = await run(["stage-draft", "--draft", "draft.json"], dir);
    await writeFile(staged.stagedDraftPath, bom + (await readFile(staged.stagedDraftPath, "utf8")));
    await run(["approve-draft", "--draft", staged.stagedDraftPath], dir);
    await writeFile(staged.stagedDraftPath, bom + (await readFile(staged.stagedDraftPath, "utf8")));
    const imported = await run(["import-draft", "--draft", staged.stagedDraftPath], dir);
    assert.equal(imported.records, 1);
    assert.equal(imported.approvalStatus, "approved");
  });
});

test("ledger validation and rebuild accept a leading BOM without rewriting the source ledger", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, ".clarissimi"));
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    const record = JSON.parse(await fixture("approved-draft.json"));
    const original = `${bom}${JSON.stringify(record)}\r\n`;
    await writeFile(ledger, original);
    const validation = await run(["validate-ledger"], dir);
    assert.equal(validation.records, 1);
    await run(["rebuild", "--out-dir", "."], dir);
    assert.equal(await readFile(ledger, "utf8"), original);
  });
});

test("ledger parsing still reports malformed JSON on its original physical line", async () => {
  const record = JSON.stringify(JSON.parse(await fixture("approved-draft.json")));
  assert.throws(
    () => parseContributionsJsonl(`${bom}${record}\n${bom}${record}\n`),
    /invalid JSON on line 2/,
  );
});
