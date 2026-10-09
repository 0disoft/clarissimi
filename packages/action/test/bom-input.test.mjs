import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadActionConfigFromEnvironment } from "../dist/config.js";
import { runActionDryRun } from "../dist/index.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-action-bom-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("Action reads a BOM-prefixed JSON config", async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, "config.json"), '\uFEFF{"markdownSummary":"table"}');
    const config = await loadActionConfigFromEnvironment({
      GITHUB_WORKSPACE: dir,
      INPUT_CONFIG_PATH: "config.json",
    });
    assert.equal(config.markdownSummary, "table");
  });
});

for (const [input, name] of [
  ["githubFixturePath", "github-merged-pr-basic.json"],
  ["eventPath", "github-pull-request-merged-event.json"],
]) {
  test(`Action reads BOM-prefixed ${input} evidence`, async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "input.json");
      const value = await readFile(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8");
      await writeFile(path, "\uFEFF" + value);
      const summary = await runActionDryRun({ [input]: path });
      assert.equal(summary.draftCount, 1);
    });
  });
}
