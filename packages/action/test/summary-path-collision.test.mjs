import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { createFakeAssessment } from "@clarissimi/providers";
import { DRAFTS_DIR_PATH, RENDERED_OUTPUT_PATHS } from "@clarissimi/renderers";
import { runActionFromEnvironment } from "../dist/index.js";

const paths = [
  ...Object.values(RENDERED_OUTPUT_PATHS),
  `${DRAFTS_DIR_PATH}/reviewed.json`,
  ".clarissimi/drafts/../contributions.jsonl",
];
if (process.platform === "win32") {
  paths.push(".CLARISSIMI/CONTRIBUTIONS.JSONL");
}

const cases = paths.map((summaryPath) => ({ summaryPath, exists: true }));
cases.push({ summaryPath: RENDERED_OUTPUT_PATHS.contributionsJsonl, exists: false });

for (const { summaryPath, exists } of cases) {
  test(`summary artifacts cannot replace recognition files: ${summaryPath} (${exists ? "existing" : "missing"})`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-summary-collision-"));
    try {
      const fixturePath = join(dir, "github-fixture.json");
      const protectedPath = join(dir, summaryPath);
      await writeFile(
        fixturePath,
        await readFile(new URL("../../../fixtures/github-merged-pr-basic.json", import.meta.url)),
      );
      const before = "existing recognition data must survive\n";
      if (exists) {
        await mkdir(dirname(protectedPath), { recursive: true });
        await writeFile(protectedPath, before, "utf8");
      }
      let stdout = "";
      let stderr = "";
      let providerCalls = 0;
      const exitCode = await runActionFromEnvironment(
        {
          GITHUB_WORKSPACE: dir,
          INPUT_GITHUB_FIXTURE: fixturePath,
          INPUT_MODE: "dry-run",
          INPUT_SUMMARY_PATH: summaryPath,
        },
        {
          stdout: (value) => {
            stdout += value;
          },
          stderr: (value) => {
            stderr += value;
          },
        },
        {
          provider: {
            id: "summary-collision-test",
            async createAssessment(input) {
              providerCalls += 1;
              return createFakeAssessment(input);
            },
          },
        },
      );

      if (exists) {
        assert.equal(await readFile(protectedPath, "utf8"), before);
      } else {
        await assert.rejects(readFile(protectedPath), { code: "ENOENT" });
      }
      assert.equal(exitCode, 1, stdout + stderr);
      assert.equal(providerCalls, 0);
      assert.equal(stdout, "");
      assert.match(
        stderr,
        /must not overwrite Clarissimi recognition outputs or draft inbox files/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("summary artifacts can still use separate files alongside recognition outputs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-summary-separate-"));
  try {
    const fixturePath = join(dir, "github-fixture.json");
    await writeFile(
      fixturePath,
      await readFile(new URL("../../../fixtures/github-merged-pr-basic.json", import.meta.url)),
    );
    for (const summaryPath of [
      ".clarissimi/run-summary.json",
      ".clarissimi/drafts-report.json",
      "CONTRIBUTORS.md.summary.json",
    ]) {
      let stderr = "";
      const exitCode = await runActionFromEnvironment(
        {
          GITHUB_WORKSPACE: dir,
          INPUT_GITHUB_FIXTURE: fixturePath,
          INPUT_MODE: "dry-run",
          INPUT_SUMMARY_PATH: summaryPath,
        },
        {
          stdout: () => {},
          stderr: (value) => {
            stderr += value;
          },
        },
      );
      assert.equal(exitCode, 0, stderr);
      assert.equal(stderr, "");
      const summary = JSON.parse(await readFile(join(dir, summaryPath), "utf8"));
      assert.equal(summary.mode, "dry-run");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
