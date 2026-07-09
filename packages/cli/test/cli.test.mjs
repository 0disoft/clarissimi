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

async function run(argv, cwd, options = {}) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    cwd,
    env: options.env,
    fetch: options.fetch,
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

test("import-draft appends an approved agent draft and writes derived outputs", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    const outDir = join(dir, "out");
    await writeFile(
      draftPath,
      JSON.stringify(
        assessment({
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "https://github.com/example/project/pull/42",
              title: "Add parser regression coverage",
              excerpt: "Raw PR body should not be written to public output."
            }
          ]
        })
      ),
      "utf8"
    );

    const result = await run(
      [
        "import-draft",
        "--draft",
        draftPath,
        "--ledger",
        ledger,
        "--out-dir",
        outDir,
        "--json"
      ],
      dir
    );
    const output = JSON.parse(result.stdout);
    const ledgerText = await readFile(ledger, "utf8");
    const contributorsMarkdown = await readFile(join(outDir, "CONTRIBUTORS.md"), "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(output.command, "import-draft");
    assert.equal(output.records, 1);
    assert.equal(output.wroteDerivedFiles, true);
    assert.equal(ledgerText.includes("Added regression coverage"), true);
    assert.equal(ledgerText.includes("Raw PR body should not be written"), false);
    assert.equal(contributorsMarkdown.includes("## octocat"), true);
  });
});

test("import-draft rejects draft approval status before writing ledger output", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(
      draftPath,
      JSON.stringify(assessment({ maintainerApprovalStatus: "draft" })),
      "utf8"
    );

    const result = await run(
      ["import-draft", "--draft", draftPath, "--ledger", ledger, "--json"],
      dir
    );

    assert.equal(result.exitCode, 6);
    assert.equal(JSON.parse(result.stdout).ok, false);
    await assert.rejects(readFile(ledger, "utf8"));
  });
});

test("import-draft rejects duplicate contributor and source records", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(draftPath, JSON.stringify(assessment()), "utf8");
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(
      ["import-draft", "--draft", draftPath, "--ledger", ledger, "--json"],
      dir
    );

    assert.equal(result.exitCode, 6);
    assert.equal(JSON.parse(result.stdout).message.includes("already exists"), true);
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

test("recognize can use the OpenAI-compatible provider when explicitly selected", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    const requests = [];
    await writeFile(
      fixturePath,
      JSON.stringify(
        fixture({
          evidence: {
            ...fixture().evidence,
            items: [
              {
                kind: "test",
                id: "tests/parser.test.ts",
                title: "parser regression coverage",
                text: "Maintainer person@example.com confirmed the regression."
              }
            ]
          }
        })
      ),
      "utf8"
    );

    const result = await run(
      [
        "recognize",
        "--fixture",
        fixturePath,
        "--mode",
        "dry-run",
        "--provider",
        "openai-compatible",
        "--provider-model",
        "clarissimi-test-model",
        "--json"
      ],
      dir,
      {
        env: {
          CLARISSIMI_PROVIDER_TOKEN: "unit-token"
        },
        fetch: async (url, init) => {
          requests.push({
            url: String(url),
            body: JSON.parse(init.body)
          });
          return jsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    contributionType: "test",
                    affectedArea: "parser regression coverage",
                    impactLevel: "medium",
                    evidenceSummary: "Added regression coverage based on test evidence.",
                    suggestedBadge: "Regression Shield",
                    publicRecognitionText: "Added regression coverage for the parser.",
                    confidence: 0.8
                  })
                }
              }
            ]
          });
        }
      }
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.provider, "openai-compatible");
    assert.equal(output.approvalStatus, "draft");
    assert.equal(output.assessment.publicRecognitionText, "Added regression coverage for the parser.");
    assert.equal(requests.length, 1);
    assert.equal(JSON.stringify(requests[0].body).includes("person@example.com"), false);
  });
});

test("recognize requires a provider token when OpenAI-compatible provider is selected", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    await writeFile(fixturePath, JSON.stringify(fixture()), "utf8");

    const result = await run(
      [
        "recognize",
        "--fixture",
        fixturePath,
        "--mode",
        "dry-run",
        "--provider",
        "openai-compatible",
        "--provider-model",
        "clarissimi-test-model"
      ],
      dir,
      {
        env: {}
      }
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr.includes("CLARISSIMI_PROVIDER_TOKEN"), true);
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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

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
