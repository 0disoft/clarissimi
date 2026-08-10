import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

test("analytics recent-share reports maintainer-only recognition share without writing files", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const otherContributor = {
      platform: "github",
      id: "456",
      login: "doc-helper",
      profileUrl: "https://github.com/doc-helper",
    };
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(
      ledger,
      [
        assessment({
          impactLevel: "high",
          source: {
            repository: "example/project",
            event: "merged_pull_request",
            pullRequestNumber: 40,
            mergedAt: "2026-07-01T00:00:00.000Z",
          },
        }),
        assessment({
          contributor: otherContributor,
          impactLevel: "low",
          contributionType: "documentation",
          affectedArea: "setup guide",
          source: {
            repository: "example/project",
            event: "merged_pull_request",
            pullRequestNumber: 41,
            mergedAt: "2026-06-01T00:00:00.000Z",
          },
        }),
        assessment({
          source: {
            repository: "example/project",
            event: "merged_pull_request",
            pullRequestNumber: 39,
            mergedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ]
        .map((record) => JSON.stringify(record))
        .join("\n") + "\n",
      "utf8",
    );

    const result = await run(
      [
        "analytics",
        "recent-share",
        "--ledger",
        ledger,
        "--as-of",
        "2026-07-09T00:00:00.000Z",
        "--window-days",
        "90",
        "--json",
      ],
      dir,
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.command, "analytics");
    assert.equal(output.subcommand, "recent-share");
    assert.equal(output.analytics.scope, "maintainer-only");
    assert.equal(output.analytics.window.includedRecords, 2);
    assert.equal(output.analytics.window.totalRecognitionWeight, 4);
    assert.equal(output.analytics.contributors[0].contributor.login, "octocat");
    assert.equal(output.analytics.contributors[0].recognitionShare, 0.75);
    await assert.rejects(readFile(join(dir, ".clarissimi", "contributors.json"), "utf8"));
    await assert.rejects(readFile(join(dir, "CONTRIBUTORS.md"), "utf8"));
  });
});

test("analytics recent-share rejects invalid as-of values as usage errors", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(
      ["analytics", "recent-share", "--ledger", ledger, "--as-of", "not-a-date", "--json"],
      dir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      command: "analytics",
      message: "--as-of must be an ISO-compatible date time.",
    });
  });
});

test("analytics recent-share rejects invalid window-day values as usage errors", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(
      ["analytics", "recent-share", "--ledger", ledger, "--window-days", "0", "--json"],
      dir,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      command: "analytics",
      message: "--window-days must be a positive integer.",
    });
  });
});

function assessment(overrides = {}) {
  return {
    schemaVersion: "clarissimi.assessment/v1",
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat",
    },
    contributionType: "test",
    affectedArea: "parser regression coverage",
    impactLevel: "medium",
    evidenceSummary: "Added a regression test for a parser crash.",
    evidenceRefs: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: "Add parser regression coverage",
      },
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
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
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-cli-analytics-"));
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
