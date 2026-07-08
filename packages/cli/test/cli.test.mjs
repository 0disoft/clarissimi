import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { runCli } from "../dist/index.js";

function assessment(overrides = {}) {
  return {
    schemaVersion: "clarissimi.assessment/v1",
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat"
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
        title: "Add parser regression coverage"
      }
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
    maintainerApprovalStatus: "approved",
    source: {
      repository: "example/project",
      event: "merged_pull_request",
      pullRequestNumber: 42,
      mergedAt: "2026-07-08T00:00:00.000Z"
    },
    ...overrides
  };
}

function fixture(overrides = {}) {
  return {
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat"
    },
    evidence: {
      source: {
        repository: "example/project",
        event: "merged_pull_request",
        pullRequestNumber: 42,
        mergedAt: "2026-07-08T00:00:00.000Z"
      },
      items: [
        {
          kind: "test",
          id: "tests/parser.test.ts",
          title: "parser regression coverage",
          text: "Added a regression case for nested parser input."
        }
      ]
    },
    hints: {
      contributionType: "test",
      affectedArea: "parser regression coverage",
      impactLevel: "medium"
    },
    ...overrides
  };
}

function githubFixture(overrides = {}) {
  return {
    repository: {
      fullName: "example/project"
    },
    pullRequest: {
      number: 42,
      title: "Add parser regression coverage",
      body: "Adds a failing parser case and keeps it covered.",
      htmlUrl: "https://github.com/example/project/pull/42",
      mergedAt: "2026-07-08T00:00:00.000Z",
      user: {
        id: 123456,
        login: "octocat",
        htmlUrl: "https://github.com/octocat"
      },
      labels: [
        {
          name: "tests"
        }
      ],
      changedFiles: [
        {
          filename: "tests/parser.spec.ts",
          status: "added",
          additions: 32,
          deletions: 0,
          patchExcerpt: "test(\"parses nested input\", () => {})"
        }
      ],
      ...overrides
    }
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-cli-"));
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
    }
  });

  return { exitCode, stdout, stderr };
}

test("validate-config accepts missing config defaults", async () => {
  await withTempDir(async (dir) => {
    const result = await run(["validate-config", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.ok, true);
    assert.equal(output.configPath, null);
  });
});

test("validate-ledger validates approved JSONL records", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(["validate-ledger", "--ledger", ledger, "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.records, 1);
  });
});

test("validate-ledger rejects draft records", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(
      ledger,
      `${JSON.stringify(assessment({ maintainerApprovalStatus: "draft" }))}\n`,
      "utf8"
    );

    const result = await run(["validate-ledger", "--ledger", ledger, "--json"], dir);

    assert.equal(result.exitCode, 3);
    assert.equal(JSON.parse(result.stdout).ok, false);
  });
});

test("recognize creates a dry-run draft without public outputs by default", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    await writeFile(fixturePath, JSON.stringify(fixture()), "utf8");

    const result = await run(
      ["recognize", "--fixture", fixturePath, "--mode", "dry-run", "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.draftCreated, true);
    assert.equal(output.approvalStatus, "draft");
    assert.equal(output.publicOutputsRendered, false);
  });
});

test("recognize renders previews when fixture explicitly carries approval", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    await writeFile(
      fixturePath,
      JSON.stringify(fixture({ maintainerApprovalStatus: "approved" })),
      "utf8"
    );

    const result = await run(
      ["recognize", "--fixture", fixturePath, "--mode", "dry-run", "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.approvalStatus, "approved");
    assert.equal(output.publicOutputsRendered, true);
    assert.equal(output.outputPreview.contributorsMarkdown.includes("## octocat"), true);
  });
});

test("recognize collects GitHub merged PR fixture evidence", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");

    const result = await run(
      ["recognize", "--github-fixture", fixturePath, "--mode", "dry-run", "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.fixtureKind, "github");
    assert.equal(output.approvalStatus, "draft");
    assert.equal(output.assessment.contributor.login, "octocat");
    assert.equal(output.assessment.source.pullRequestNumber, 42);
    assert.equal(JSON.stringify(output).includes("Adds a failing parser case"), false);
  });
});

test("recognize rejects ambiguous fixture inputs", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    const githubFixturePath = join(dir, "github-fixture.json");
    await writeFile(fixturePath, JSON.stringify(fixture()), "utf8");
    await writeFile(githubFixturePath, JSON.stringify(githubFixture()), "utf8");

    const result = await run(
      [
        "recognize",
        "--fixture",
        fixturePath,
        "--github-fixture",
        githubFixturePath,
        "--mode",
        "dry-run"
      ],
      dir
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr.includes("only one fixture input"), true);
  });
});

test("rebuild writes derived outputs only when out-dir is provided", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "out");
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(["rebuild", "--ledger", ledger, "--out-dir", outDir, "--json"], dir);
    const output = JSON.parse(result.stdout);
    const markdown = await readFile(join(outDir, "CONTRIBUTORS.md"), "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(output.wroteFiles, true);
    assert.equal(markdown.includes("Added regression coverage"), true);
  });
});
