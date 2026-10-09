import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

for (const command of [
  ["validate-ledger"],
  ["rebuild", "--out-dir", "."],
  ["render-page", "--out-dir", "."],
  ["analytics", "recent-share"],
]) {
  test(`${command[0]} reports invalid historical ledger dates without changing outputs`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-invalid-ledger-date-"));
    try {
      const record = JSON.parse(
        await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
      );
      record.source.mergedAt = "2026-13-08T00:00:00Z";
      await mkdir(join(dir, ".clarissimi"));
      const files = new Map([
        [join(dir, ".clarissimi", "contributions.jsonl"), `${JSON.stringify(record)}\n`],
        [join(dir, ".clarissimi", "contributors.json"), "existing contributor data\n"],
        [join(dir, "CONTRIBUTORS.md"), "existing contributor history\n"],
        [join(dir, "index.html"), "existing contributor page\n"],
      ]);
      for (const [path, contents] of files) {
        await writeFile(path, contents, "utf8");
      }
      let stdout = "";
      let stderr = "";
      const exitCode = await runCli([...command, "--json"], {
        cwd: dir,
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        },
      });

      assert.equal(exitCode, 3, stdout + stderr);
      assert.equal(stderr, "");
      assert.equal(JSON.parse(stdout).ok, false);
      assert.match(JSON.parse(stdout).message, /line 1/);
      assert.ok(JSON.parse(stdout).message.includes("$.source.mergedAt"));
      assert.ok(!stdout.includes(record.source.mergedAt));
      assert.doesNotMatch(stdout, /Invalid time value/);
      for (const [path, contents] of files) {
        assert.equal(await readFile(path, "utf8"), contents, path);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
