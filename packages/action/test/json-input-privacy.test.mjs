import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readActionJsonFile } from "../dist/json-input.js";
import { runActionFromEnvironment } from "../dist/index.js";

async function withInput(text, task) {
  const directory = await mkdtemp(join(tmpdir(), "clarissimi-json-privacy-"));
  const path = join(directory, "event.json");
  try {
    await writeFile(path, text, "utf8");
    await task(path, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Action JSON errors preserve SyntaxError without input excerpts or a raw cause", async () => {
  const marker = "CANARY_X";
  await withInput(marker, async (path) => {
    await assert.rejects(readActionJsonFile(path), (error) => {
      assert.equal(error instanceof SyntaxError, true);
      assert.equal(error.message, "Invalid JSON in Action input.");
      assert.equal(String(error.stack).includes(marker), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  });
});

test("Action JSON errors retain numeric locations without exposing property names", async () => {
  await withInput('{\n "CANARY_X": 1,\n}', async (path) => {
    await assert.rejects(readActionJsonFile(path), (error) => {
      assert.equal(error instanceof SyntaxError, true);
      assert.equal(error.message, "Invalid JSON in Action input at line 3, column 1.");
      return true;
    });
  });
});

test("Action JSON reading preserves BOM support and filesystem error codes", async () => {
  await withInput('\uFEFF{"ok":true}', async (path, directory) => {
    assert.deepEqual(await readActionJsonFile(path), { ok: true });
    await assert.rejects(readActionJsonFile(join(directory, "missing.json")), { code: "ENOENT" });
  });
});

for (const mode of ["dry-run", "gate"]) {
  test(`${mode} keeps malformed event content out of Action stderr`, async () => {
    const marker = "CANARY_X";
    await withInput(marker, async (path, directory) => {
      let stdout = "";
      let stderr = "";
      let requests = 0;
      const output = join(directory, "output.txt");
      const summary = join(directory, "summary.md");
      const exitCode = await runActionFromEnvironment(
        {
          INPUT_MODE: mode,
          GITHUB_EVENT_PATH: path,
          GITHUB_TOKEN: "unit-token",
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
        { stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) },
        {
          fetch: async () => {
            requests += 1;
            throw new Error("Unexpected network request.");
          },
        },
      );
      assert.equal(exitCode, 4);
      assert.equal(stdout, "");
      assert.equal(stderr.includes(marker), false);
      assert.equal(stderr, "Invalid JSON in Action input.\n");
      assert.equal(requests, 0);
      await assert.rejects(stat(output), { code: "ENOENT" });
      await assert.rejects(stat(summary), { code: "ENOENT" });
    });
  });
}
