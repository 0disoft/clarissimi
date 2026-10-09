import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PROVIDER_EVIDENCE_LIMITS } from "../../core/dist/index.js";
import { createFakeContributionDraftProvider } from "../../providers/dist/index.js";
import { recognizeFixture } from "../dist/fixture.js";
import { runCli } from "../dist/index.js";

for (const [field, value, label = field] of [
  ["contributor.platform", "private-invalid-marker"],
  ["contributor.login", 42],
  ["contributor.profileUrl", "https://github.com/wrong-user"],
  ["evidence.source.repository", "private-invalid-marker"],
  ["evidence.source.event", "private-invalid-marker"],
  ["evidence.source.pullRequestNumber", 0],
  ["evidence.source.mergedAt", "private-invalid-marker"],
  ["evidence.items", undefined, "missing evidence items"],
  ["evidence.items", null, "null evidence items"],
  ["evidence.items", {}, "non-array evidence items"],
  ["evidence.items", [], "empty evidence items"],
  [
    "evidence.items",
    Array.from({ length: PROVIDER_EVIDENCE_LIMITS.maxItems + 1 }, () => ({})),
    "oversized evidence items",
  ],
  ["evidence.items.0", null],
  ["evidence.items.0.kind", "private-invalid-marker"],
  ["evidence.items.0.id", 42],
  ["evidence.items.0.id", "", "empty evidence item ID"],
  ["evidence.items.0.url", 42],
  ["evidence.items.0.url", "private-invalid-marker", "malformed evidence URL"],
  ["evidence.items.0.title", false],
  ["evidence.items.0.excerpt", {}],
  ["evidence.items.0.text", 42],
]) {
  test(`recognize validates ${label} before invoking its provider`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-fixture-input-"));
    try {
      const fixture = JSON.parse(
        await readFile(new URL("../../../fixtures/merged-pr-basic.json", import.meta.url), "utf8"),
      );
      fixture.maintainerApprovalStatus = "draft";
      const parts = field.split(".");
      const expectedPath = field.replace(/\.(\d+)/g, "[$1]");
      let object = fixture;
      for (const part of parts.slice(0, -1)) {
        object = object[part];
      }
      object[parts.at(-1)] = value;
      const path = join(dir, "fixture.json");
      const input = JSON.stringify(fixture);
      await writeFile(path, input);
      let calls = 0;
      let failure;
      try {
        await recognizeFixture(path, {
          id: "counting-provider",
          createAssessment: async () => {
            calls += 1;
            throw new Error("Invalid fixture reached the provider.");
          },
        });
      } catch (error) {
        failure = error;
      }
      assert.equal(calls, 0);
      assert.ok(failure instanceof Error);
      assert.ok(failure.message.includes(expectedPath), failure.message);
      for (const jsonFlags of [[], ["--json"]]) {
        let stdout = "";
        let stderr = "";
        const code = await runCli(["recognize", "--fixture", path, ...jsonFlags], {
          cwd: dir,
          stdout: (text) => {
            stdout += text;
          },
          stderr: (text) => {
            stderr += text;
          },
        });
        assert.equal(code, 4, stdout + stderr);
        const message = jsonFlags.length > 0 ? JSON.parse(stdout).message : stderr;
        assert.ok(message.includes(expectedPath), message);
        assert.ok(!message.includes("private-invalid-marker"), message);
        assert.equal(jsonFlags.length > 0 ? stderr : stdout, "");
      }
      assert.equal(await readFile(path, "utf8"), input);
      assert.deepEqual(await readdir(dir), ["fixture.json"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("recognize accepts valid evidence URLs and optional metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-valid-fixture-"));
  try {
    const fixture = JSON.parse(
      await readFile(new URL("../../../fixtures/merged-pr-basic.json", import.meta.url), "utf8"),
    );
    fixture.maintainerApprovalStatus = "draft";
    const url = "https://github.com/example/project/pull/42";
    fixture.evidence.items[0].url = url;
    fixture.evidence.items[0].metadata = {
      supported: true,
      labels: ["test", "maintenance"],
      optional: null,
    };
    const path = join(dir, "fixture.json");
    await writeFile(path, JSON.stringify(fixture));
    const provider = createFakeContributionDraftProvider();
    let calls = 0;
    const result = await recognizeFixture(path, {
      id: provider.id,
      createAssessment: async (input) => {
        calls += 1;
        return provider.createAssessment(input);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.assessment.evidenceRefs[0].url, url);
    assert.equal(result.assessment.maintainerApprovalStatus, "draft");
    assert.deepEqual(await readdir(dir), ["fixture.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
