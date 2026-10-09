import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recognizeFixture } from "../dist/fixture.js";
import { runCli } from "../dist/index.js";

for (const [field, value] of [
  ["contributor.platform", "private-invalid-marker"],
  ["contributor.login", 42],
  ["contributor.profileUrl", "https://github.com/wrong-user"],
  ["evidence.source.repository", "private-invalid-marker"],
  ["evidence.source.event", "private-invalid-marker"],
  ["evidence.source.pullRequestNumber", 0],
  ["evidence.source.mergedAt", "private-invalid-marker"],
]) {
  test(`recognize validates ${field} before invoking its provider`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-fixture-input-"));
    try {
      const fixture = JSON.parse(
        await readFile(new URL("../../../fixtures/merged-pr-basic.json", import.meta.url), "utf8"),
      );
      fixture.maintainerApprovalStatus = "draft";
      const parts = field.split(".");
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
      assert.ok(failure.message.includes(field), failure.message);
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
        assert.ok(message.includes(field), message);
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
