import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function run(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  assert.equal(code, 0, stdout + stderr);
  assert.equal(stderr, "");
  return stdout;
}

for (const [kind, status] of [
  ["evidence", "draft"],
  ["github", "draft"],
  ["evidence", "approved"],
]) {
  test(`human recognize reports ${kind} ${status} processing and redaction without exposing source text`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-recognize-output-"));
    try {
      const fixture = JSON.parse(
        await readFile(
          new URL(
            kind === "evidence"
              ? "../../../fixtures/merged-pr-basic.json"
              : "../../../fixtures/github-merged-pr-basic.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const rawText = "unpublished-body-marker Contact person@example.com for details.";
      if (kind === "evidence") {
        fixture.maintainerApprovalStatus = status;
        fixture.evidence.items[0].text = rawText;
      } else {
        fixture.pullRequest.body = rawText;
      }
      const fixturePath = join(dir, "input fixture.json");
      const fixtureText = JSON.stringify(fixture);
      await writeFile(fixturePath, fixtureText);
      const before = await readdir(dir);
      const args = [
        "recognize",
        kind === "evidence" ? "--fixture" : "--github-fixture",
        "input fixture.json",
      ];
      const human = await run(args, dir);
      const json = JSON.parse(await run([...args, "--json"], dir));
      assert.ok(human.includes(`Fixture: ${fixturePath} (${kind})`), human);
      assert.ok(human.includes(`Provider: ${json.provider}`), human);
      assert.ok(human.includes(`Approval status: ${status}`), human);
      assert.ok(json.redactionMatchCount > 0);
      assert.ok(human.includes(`Redaction matches: ${json.redactionMatchCount}`), human);
      assert.match(human, /Files written: none \(dry-run\)/);
      assert.match(human, /--json.*inspect/i);
      for (const output of [human, JSON.stringify(json)]) {
        assert.ok(!output.includes("person@example.com"), output);
        assert.ok(!output.includes("unpublished-body-marker"), output);
      }
      assert.equal(json.approvalStatus, status);
      assert.equal(json.publicOutputsRendered, status === "approved");
      assert.ok(!("humanDetails" in json));
      assert.deepEqual(await readdir(dir), before);
      assert.equal(await readFile(fixturePath, "utf8"), fixtureText);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
