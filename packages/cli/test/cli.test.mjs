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

test("global help flag prints usage successfully", async () => {
  await withTempDir(async (dir) => {
    const result = await run(["--help"], dir);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Clarissimi CLI/);
    assert.match(result.stdout, /clarissimi --help/);
    assert.match(result.stdout, /--config <path>/);
    assert.match(result.stdout, /--provider-endpoint <url>/);
  });
});

test("command help flag prints usage successfully", async () => {
  await withTempDir(async (dir) => {
    const result = await run(["recognize", "--help"], dir);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /clarissimi recognize/);
    assert.match(result.stdout, /--provider-thinking disabled/);
  });
});

test("validate-config accepts missing config defaults", async () => {
  await withTempDir(async (dir) => {
    const result = await run(["validate-config", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.ok, true);
    assert.equal(output.configPath, null);
  });
});

test("validate-config rejects unsupported provider values", async () => {
  await withTempDir(async (dir) => {
    const configDir = join(dir, ".clarissimi");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      `${JSON.stringify({ provider: "ranking-model" })}\n`,
      "utf8"
    );

    const result = await run(["validate-config", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 2);
    assert.equal(output.ok, false);
    assert.match(output.message, /provider has an unsupported value/);
  });
});

test("validate-config rejects invalid provider endpoint values", async () => {
  await withTempDir(async (dir) => {
    const configDir = join(dir, ".clarissimi");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      `${JSON.stringify({ providerEndpoint: "not a url" })}\n`,
      "utf8"
    );

    const result = await run(["validate-config", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 2);
    assert.equal(output.ok, false);
    assert.match(output.message, /valid HTTP\(S\) URL/);
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

test("validate-ledger rejects duplicate contributor source records", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(
      ledger,
      [
        assessment(),
        assessment({
          contributionType: "documentation",
          affectedArea: "setup guide",
          suggestedBadge: "Docs Pathfinder",
          publicRecognitionText: "Improved setup documentation for first-time contributors."
        })
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8"
    );

    const result = await run(["validate-ledger", "--ledger", ledger, "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 3);
    assert.equal(output.ok, false);
    assert.match(output.message, /duplicate contribution records/);
  });
});

test("analytics recent-share reports maintainer-only recognition share without writing files", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const otherContributor = {
      platform: "github",
      id: "456",
      login: "doc-helper",
      profileUrl: "https://github.com/doc-helper"
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
            mergedAt: "2026-07-01T00:00:00.000Z"
          }
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
            mergedAt: "2026-06-01T00:00:00.000Z"
          }
        }),
        assessment({
          source: {
            repository: "example/project",
            event: "merged_pull_request",
            pullRequestNumber: 39,
            mergedAt: "2026-01-01T00:00:00.000Z"
          }
        })
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8"
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
        "--json"
      ],
      dir
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

test("rebuild rejects duplicate ledger records before writing derived outputs", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "out");
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(
      ledger,
      [
        assessment(),
        assessment({
          contributionType: "maintenance",
          affectedArea: "release notes",
          suggestedBadge: "Release Steward",
          publicRecognitionText: "Helped keep release notes accurate."
        })
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8"
    );

    const result = await run(["rebuild", "--ledger", ledger, "--out-dir", outDir, "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 3);
    assert.equal(output.ok, false);
    assert.match(output.message, /duplicate contribution records/);
    await assert.rejects(readFile(join(outDir, "CONTRIBUTORS.md"), "utf8"));
  });
});

test("stage-draft writes a sanitized review copy without touching the ledger", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    const draftsDir = join(dir, ".clarissimi", "drafts");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(
      draftPath,
      JSON.stringify(
        assessment({
          maintainerApprovalStatus: "draft",
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "https://github.com/example/project/pull/42",
              title: "Add parser regression coverage",
              excerpt: "Raw PR body should stay out of staged review storage."
            }
          ]
        })
      ),
      "utf8"
    );

    const result = await run(
      ["stage-draft", "--draft", draftPath, "--drafts-dir", draftsDir, "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);
    const stagedText = await readFile(output.stagedDraftPath, "utf8");
    const stagedDraft = JSON.parse(stagedText);

    assert.equal(result.exitCode, 0);
    assert.equal(output.command, "stage-draft");
    assert.equal(output.approvalStatus, "draft");
    assert.equal(output.stagedDraftPath.endsWith("example-project-merged_pull_request-42.json"), true);
    assert.equal(stagedDraft.maintainerApprovalStatus, "draft");
    assert.equal(stagedText.includes("Raw PR body should stay out"), false);
    await assert.rejects(readFile(ledger, "utf8"));
  });
});

test("stage-draft accepts delegated envelopes without storing provenance", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "delegated-draft.json");
    const draftsDir = join(dir, ".clarissimi", "drafts");
    await writeFile(
      draftPath,
      JSON.stringify({
        schemaVersion: "clarissimi.draft-envelope/v1",
        draftProvenance: {
          drafter: "codex",
          model: "example-model"
        },
        assessment: assessment({ maintainerApprovalStatus: "draft" })
      }),
      "utf8"
    );

    const result = await run(
      ["stage-draft", "--draft", draftPath, "--drafts-dir", draftsDir, "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);
    const stagedText = await readFile(output.stagedDraftPath, "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(output.draftFormat, "draft-envelope");
    assert.equal(stagedText.includes("draftProvenance"), false);
    assert.equal(stagedText.includes("example-model"), false);
  });
});

test("stage-draft rejects approved assessments before staging", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "approved-draft.json");
    await writeFile(draftPath, JSON.stringify(assessment()), "utf8");

    const result = await run(["stage-draft", "--draft", draftPath, "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 6);
    assert.equal(output.message, "Only draft assessments can be staged for maintainer review.");
  });
});

test("stage-draft rejects duplicate staged draft paths", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    await writeFile(
      draftPath,
      JSON.stringify(assessment({ maintainerApprovalStatus: "draft" })),
      "utf8"
    );

    const first = await run(["stage-draft", "--draft", draftPath, "--json"], dir);
    const second = await run(["stage-draft", "--draft", draftPath, "--json"], dir);

    assert.equal(first.exitCode, 0);
    assert.equal(second.exitCode, 6);
    assert.equal(JSON.parse(second.stdout).message.includes("already staged"), true);
  });
});

test("approve-draft marks a staged draft approved without touching the ledger", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(
      draftPath,
      JSON.stringify(
        assessment({
          maintainerApprovalStatus: "draft",
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "https://github.com/example/project/pull/42",
              title: "Add parser regression coverage",
              excerpt: "Raw PR body should not survive approval."
            }
          ]
        })
      ),
      "utf8"
    );

    const result = await run(["approve-draft", "--draft", draftPath, "--json"], dir);
    const output = JSON.parse(result.stdout);
    const approvedText = await readFile(draftPath, "utf8");
    const approvedDraft = JSON.parse(approvedText);

    assert.equal(result.exitCode, 0);
    assert.equal(output.command, "approve-draft");
    assert.equal(output.approvalStatus, "approved");
    assert.equal(approvedDraft.maintainerApprovalStatus, "approved");
    assert.equal(approvedText.includes("Raw PR body should not survive approval"), false);
    await assert.rejects(readFile(ledger, "utf8"));
  });
});

test("approve-draft accepts delegated envelopes without storing provenance", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "delegated-draft.json");
    await writeFile(
      draftPath,
      JSON.stringify({
        schemaVersion: "clarissimi.draft-envelope/v1",
        draftProvenance: {
          drafter: "codex",
          delegatedTo: "external-llm",
          model: "example-model"
        },
        assessment: assessment({ maintainerApprovalStatus: "draft" })
      }),
      "utf8"
    );

    const result = await run(["approve-draft", "--draft", draftPath, "--json"], dir);
    const approvedText = await readFile(draftPath, "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout).draftFormat, "draft-envelope");
    assert.equal(JSON.parse(approvedText).maintainerApprovalStatus, "approved");
    assert.equal(approvedText.includes("draftProvenance"), false);
    assert.equal(approvedText.includes("external-llm"), false);
  });
});

test("approve-draft rejects non-draft approval states", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "approved-draft.json");
    await writeFile(draftPath, JSON.stringify(assessment()), "utf8");

    const result = await run(["approve-draft", "--draft", draftPath, "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 6);
    assert.equal(output.message, "Only draft assessments can be staged for maintainer review.");
  });
});

test("approve-draft output can be imported into the public ledger", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "agent-draft.json");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(
      draftPath,
      JSON.stringify(assessment({ maintainerApprovalStatus: "draft" })),
      "utf8"
    );

    const approvalResult = await run(["approve-draft", "--draft", draftPath, "--json"], dir);
    const importResult = await run(
      ["import-draft", "--draft", draftPath, "--ledger", ledger, "--json"],
      dir
    );
    const ledgerText = await readFile(ledger, "utf8");

    assert.equal(approvalResult.exitCode, 0);
    assert.equal(importResult.exitCode, 0);
    assert.equal(JSON.parse(importResult.stdout).records, 1);
    assert.equal(ledgerText.includes("\"maintainerApprovalStatus\":\"approved\""), true);
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

test("import-draft accepts a delegated LLM draft envelope without storing provenance", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "delegated-draft.json");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(
      draftPath,
      JSON.stringify({
        schemaVersion: "clarissimi.draft-envelope/v1",
        draftProvenance: {
          drafter: "codex",
          delegatedTo: "external-llm",
          model: "example-model"
        },
        assessment: assessment()
      }),
      "utf8"
    );

    const result = await run(
      ["import-draft", "--draft", draftPath, "--ledger", ledger, "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);
    const ledgerText = await readFile(ledger, "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(output.draftFormat, "draft-envelope");
    assert.equal(ledgerText.includes("delegatedTo"), false);
    assert.equal(ledgerText.includes("example-model"), false);
    assert.equal(ledgerText.includes("Added regression coverage"), true);
  });
});

test("import-draft rejects malformed delegated draft envelopes", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "malformed-delegated-draft.json");
    const ledger = join(dir, ".clarissimi", "contributions.jsonl");
    await writeFile(
      draftPath,
      JSON.stringify({
        schemaVersion: "clarissimi.draft-envelope/v1",
        draftProvenance: "external-llm"
      }),
      "utf8"
    );

    const result = await run(
      ["import-draft", "--draft", draftPath, "--ledger", ledger, "--json"],
      dir
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 6);
    assert.equal(output.message, "Draft envelope is not valid.");
    await assert.rejects(readFile(ledger, "utf8"));
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
        "--provider-thinking",
        "disabled",
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
    assert.deepEqual(requests[0].body.thinking, { type: "disabled" });
    assert.equal(JSON.stringify(requests[0].body).includes("person@example.com"), false);
  });
});

test("recognize uses JSON config provider values when flags are omitted", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    const configDir = join(dir, ".clarissimi");
    const requests = [];
    await mkdir(configDir, { recursive: true });
    await writeFile(fixturePath, JSON.stringify(fixture()), "utf8");
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        provider: "openai-compatible",
        providerModel: "config-model",
        providerThinking: "disabled",
        mode: "dry-run"
      }),
      "utf8"
    );

    const result = await run(
      ["recognize", "--fixture", fixturePath, "--json"],
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
    assert.equal(output.mode, "dry-run");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, "config-model");
    assert.deepEqual(requests[0].body.thinking, { type: "disabled" });
  });
});

test("recognize lets explicit provider flags override JSON config values", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    const configDir = join(dir, ".clarissimi");
    const requests = [];
    await mkdir(configDir, { recursive: true });
    await writeFile(fixturePath, JSON.stringify(fixture()), "utf8");
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        provider: "fake",
        providerModel: "config-model",
        providerThinking: "disabled"
      }),
      "utf8"
    );

    const result = await run(
      [
        "recognize",
        "--fixture",
        fixturePath,
        "--provider",
        "openai-compatible",
        "--provider-model",
        "flag-model",
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
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, "flag-model");
  });
});

test("recognize rejects unsupported config mode before provider calls", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "fixture.json");
    const configDir = join(dir, ".clarissimi");
    let calls = 0;
    await mkdir(configDir, { recursive: true });
    await writeFile(fixturePath, JSON.stringify(fixture()), "utf8");
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        provider: "openai-compatible",
        providerModel: "config-model",
        mode: "propose"
      }),
      "utf8"
    );

    const result = await run(
      ["recognize", "--fixture", fixturePath],
      dir,
      {
        env: {
          CLARISSIMI_PROVIDER_TOKEN: "unit-token"
        },
        fetch: async () => {
          calls += 1;
          return jsonResponse({});
        }
      }
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr.includes("--mode dry-run"), true);
    assert.equal(calls, 0);
  });
});

test("recognize rejects unsupported provider thinking values", async () => {
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
        "clarissimi-test-model",
        "--provider-thinking",
        "enabled"
      ],
      dir,
      {
        env: {
          CLARISSIMI_PROVIDER_TOKEN: "unit-token"
        }
      }
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr.includes("provider thinking"), true);
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
