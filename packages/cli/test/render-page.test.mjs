import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

function assessment(overrides = {}) {
  return {
    schemaVersion: "clarissimi.assessment/v1",
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat",
    },
    contributionType: "documentation",
    affectedArea: "contributor onboarding",
    impactLevel: "medium",
    evidenceSummary: "Documented contributor setup.",
    evidenceRefs: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: "Document contributor setup",
      },
    ],
    suggestedBadge: "Guide Builder",
    publicRecognitionText: "Improved contributor onboarding documentation.",
    confidence: 0.9,
    maintainerApprovalStatus: "approved",
    source: {
      repository: "example/project",
      event: "merged_pull_request",
      pullRequestNumber: 42,
      mergedAt: "2026-07-08T00:00:00.000Z",
    },
    ...overrides,
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-render-page-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

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

test("render-page writes one deployable index.html and reports its path", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "docs", "contributors");
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(
      ["render-page", "--ledger", ledger, "--out-dir", outDir, "--json"],
      dir,
    );
    const output = JSON.parse(result.stdout);
    const page = await readFile(join(outDir, "index.html"), "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.command, "render-page");
    assert.equal(output.pagePath, join(outDir, "index.html"));
    assert.deepEqual(output.files, ["index.html"]);
    assert.match(page, /example\/project contributors/);
    assert.match(page, /Improved contributor onboarding documentation\./);
  });
});

test("render-page requires an explicit output directory before reading config", async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, "clarissimi.config.ts"), "not valid TypeScript\n", "utf8");

    const result = await run(["render-page", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(output.message, "render-page requires --out-dir <path>.");
  });
});

test("render-page preserves automation in the ledger while honoring the display opt-out", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "site");
    const bot = assessment({
      contributor: {
        platform: "github",
        id: "200",
        login: "dependabot[bot]",
        profileUrl: "https://github.com/apps/dependabot",
        kind: "bot",
      },
    });
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(bot)}\n`, "utf8");

    const result = await run(
      [
        "render-page",
        "--ledger",
        ledger,
        "--out-dir",
        outDir,
        "--exclude-automation-contributors",
        "--json",
      ],
      dir,
    );
    const page = await readFile(join(outDir, "index.html"), "utf8");
    const ledgerText = await readFile(ledger, "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(page.includes("dependabot"), false);
    assert.equal(ledgerText.includes("dependabot[bot]"), true);
  });
});

test("render-page rejects duplicate ledger identities before writing", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "site");
    const record = assessment();
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`, "utf8");

    const result = await run(
      ["render-page", "--ledger", ledger, "--out-dir", outDir, "--json"],
      dir,
    );

    assert.equal(result.exitCode, 3);
    await assert.rejects(readFile(join(outDir, "index.html"), "utf8"));
  });
});
