import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  runActionFromEnvironment,
  runActionPromoteDraft,
  runActionPropose,
  runActionStageDraft
} from "../dist/index.js";

function githubFixture(overrides = {}) {
  return {
    maintainerApprovalStatus: "approved",
    repository: {
      fullName: "sample/project"
    },
    pullRequest: {
      number: 42,
      title: "Add parser regression coverage",
      body: "Adds a failing parser case and keeps it covered.",
      htmlUrl: "https://github.com/sample/project/pull/42",
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
          patchExcerpt: "PATCH_EXCERPT_SENTINEL"
        }
      ],
      mergeCommitSha: "abc123def4567890",
      ...overrides
    }
  };
}

function pullRequestEvent(overrides = {}) {
  return {
    maintainerApprovalStatus: "approved",
    repository: {
      full_name: "sample/project"
    },
    pull_request: {
      number: 42,
      title: "Add parser regression coverage",
      body: "Event body should not be copied to outputs.",
      html_url: "https://github.com/sample/project/pull/42",
      merged_at: "2026-07-08T00:00:00.000Z",
      merge_commit_sha: "abc123def4567890",
      user: {
        id: 123456,
        login: "octocat",
        html_url: "https://github.com/octocat"
      },
      labels: [
        {
          name: "tests"
        }
      ],
      ...overrides
    }
  };
}

function approvedDraftAssessment(overrides = {}) {
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
        url: "https://github.com/sample/project/pull/42",
        title: "Add parser regression coverage"
      }
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
    maintainerApprovalStatus: "approved",
    source: {
      repository: "sample/project",
      event: "merged_pull_request",
      pullRequestNumber: 42,
      mergedAt: "2026-07-08T00:00:00.000Z"
    },
    ...overrides
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-propose-runner-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test("runs fixture-first propose mode through branch publish and pull request creation", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const fixturePath = join(dir, "github-fixture.json");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    const remoteMainSha = await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]);

    const summary = await runActionPropose({
      mode: "propose",
      githubFixturePath: fixturePath,
      repositoryDir,
      stagingDir,
      baseBranch: "main",
      pullRequestClient: client
    });

    assert.equal(summary.mode, "propose");
    assert.equal(summary.inputSource, "github_fixture");
    assert.equal(summary.proposedEntryCount, 1);
    assert.equal(summary.publicOutputsRendered, true);
    assert.equal(summary.approvalStatus, "approved");
    assert.equal(summary.stagedFileCount, 4);
    assert.equal(summary.proposalBranch, "clarissimi/recognition/merged_pull_request-42");
    assert.equal(summary.proposalPullRequestUrl, "https://github.com/sample/project/pull/1");
    assert.equal(await remoteBranchSha(repositoryDir, summary.proposalBranch), summary.proposalCommitSha);
    assert.equal(await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]), remoteMainSha);
    assert.equal(client.created.length, 1);
    assert.equal(client.created[0].body.includes("PATCH_EXCERPT_SENTINEL"), false);
  });
});

test("propose mode preserves existing ledger records when rendering a new contribution", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const fixturePath = join(dir, "github-fixture.json");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await commitExistingLedger(repositoryDir, approvedDraftAssessment({
      contributor: {
        platform: "github",
        id: "654321",
        login: "hubot",
        profileUrl: "https://github.com/hubot"
      },
      source: {
        repository: "sample/project",
        event: "merged_pull_request",
        pullRequestNumber: 41,
        mergedAt: "2026-07-07T00:00:00.000Z"
      }
    }));
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");

    await runActionPropose({
      mode: "propose",
      githubFixturePath: fixturePath,
      repositoryDir,
      stagingDir,
      baseBranch: "main",
      pullRequestClient: client
    });
    const records = (await readFile(
      join(stagingDir, ".clarissimi", "contributions.jsonl"),
      "utf8"
    )).trim().split("\n").map((line) => JSON.parse(line));

    assert.equal(records.length, 2);
    assert.equal(records[0].contributor.login, "hubot");
    assert.equal(records[1].contributor.login, "octocat");
  });
});

test("runs fixture-first stage-draft mode through draft branch and pull request creation", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const fixturePath = join(dir, "github-fixture.json");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await writeFile(
      fixturePath,
      JSON.stringify({
        ...githubFixture(),
        maintainerApprovalStatus: "draft"
      }),
      "utf8"
    );
    const remoteMainSha = await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]);

    const summary = await runActionStageDraft({
      mode: "stage-draft",
      githubFixturePath: fixturePath,
      repositoryDir,
      stagingDir,
      baseBranch: "main",
      pullRequestClient: client
    });
    const stagedDraftText = await readFile(
      join(stagingDir, ".clarissimi", "drafts", "sample-project-merged_pull_request-42.json"),
      "utf8"
    );

    assert.equal(summary.mode, "stage-draft");
    assert.equal(summary.inputSource, "github_fixture");
    assert.equal(summary.proposedEntryCount, 0);
    assert.equal(summary.publicOutputsRendered, false);
    assert.equal(summary.approvalStatus, "draft");
    assert.equal(summary.stagedFileCount, 1);
    assert.equal(summary.proposalBranch, "clarissimi/drafts/merged_pull_request-42");
    assert.equal(summary.proposalPullRequestUrl, "https://github.com/sample/project/pull/1");
    assert.equal(await remoteBranchSha(repositoryDir, summary.proposalBranch), summary.proposalCommitSha);
    assert.equal(await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]), remoteMainSha);
    assert.equal(client.created.length, 1);
    assert.equal(client.created[0].title, "Clarissimi draft review: sample/project#42");
    assert.equal(client.created[0].body.includes("Clarissimi draft review proposal"), true);
    assert.equal(stagedDraftText.includes('"maintainerApprovalStatus": "draft"'), true);
    assert.equal(stagedDraftText.includes("PATCH_EXCERPT_SENTINEL"), false);
  });
});

test("promotes an approved draft through a public recognition proposal", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const draftPath = join(repositoryDir, ".clarissimi", "drafts", "sample-project-42.json");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await mkdir(join(repositoryDir, ".clarissimi", "drafts"), { recursive: true });
    await writeFile(draftPath, JSON.stringify(approvedDraftAssessment()), "utf8");
    const remoteMainSha = await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]);

    const summary = await runActionPromoteDraft({
      mode: "promote-draft",
      draftPath,
      repositoryDir,
      stagingDir,
      baseBranch: "main",
      pullRequestClient: client
    });

    assert.equal(summary.mode, "promote-draft");
    assert.equal(summary.inputSource, "approved_draft");
    assert.equal(summary.proposedEntryCount, 1);
    assert.equal(summary.publicOutputsRendered, true);
    assert.equal(summary.approvalStatus, "approved");
    assert.equal(summary.stagedFileCount, 4);
    assert.equal(summary.proposalBranch, "clarissimi/recognition/merged_pull_request-42");
    assert.equal(await remoteBranchSha(repositoryDir, summary.proposalBranch), summary.proposalCommitSha);
    assert.equal(await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]), remoteMainSha);
    assert.equal(client.created.length, 1);
    assert.equal(client.created[0].title, "Clarissimi recognition: sample/project#42");
  });
});

test("environment runner writes promote-draft proposal outputs", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const draftRelativePath = ".clarissimi/drafts/sample-project-42.json";
    const draftPath = join(repositoryDir, draftRelativePath);
    const outputPath = join(dir, "github-output.txt");
    const summaryPath = join(dir, "step-summary.md");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await mkdir(join(repositoryDir, ".clarissimi", "drafts"), { recursive: true });
    await writeFile(draftPath, JSON.stringify(approvedDraftAssessment()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_WORKSPACE: repositoryDir,
        GITHUB_REPOSITORY: "0disoft/clarissimi",
        INPUT_BASE_BRANCH: "main",
        INPUT_DRAFT_PATH: draftRelativePath,
        INPUT_MARKDOWN_SUMMARY: "table",
        INPUT_MODE: "promote-draft",
        INPUT_STAGING_DIR: stagingDir,
        GITHUB_TOKEN: "test-token"
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      },
      {
        pullRequestClient: client
      }
    );
    const parsed = JSON.parse(stdout);
    const outputText = await readFile(outputPath, "utf8");
    const summaryText = await readFile(summaryPath, "utf8");
    const contributorsMarkdown = await readFile(join(stagingDir, "CONTRIBUTORS.md"), "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(parsed.mode, "promote-draft");
    assert.equal(outputText.includes("staged-file-count=4"), true);
    assert.equal(
      outputText.includes("proposal-branch=clarissimi/recognition/merged_pull_request-42"),
      true
    );
    assert.equal(outputText.includes("proposal-pull-request-number=1"), true);
    assert.equal(outputText.includes("proposal-pull-request-action=created"), true);
    assert.equal(summaryText.includes("## Clarissimi promote-draft summary"), true);
    assert.equal(contributorsMarkdown.includes("| Contributor | Total | Types |"), true);
    assert.equal(contributorsMarkdown.includes("## octocat"), true);
    assert.equal(client.created[0].repository, "0disoft/clarissimi");
  });
});

test("promote-draft rejects a contribution already present in the ledger before branch mutation", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const draftPath = join(repositoryDir, ".clarissimi", "drafts", "sample-project-42.json");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await commitExistingLedger(repositoryDir, approvedDraftAssessment());
    await mkdir(join(repositoryDir, ".clarissimi", "drafts"), { recursive: true });
    await writeFile(draftPath, JSON.stringify(approvedDraftAssessment()), "utf8");

    await assert.rejects(
      () => runActionPromoteDraft({
        mode: "promote-draft",
        draftPath,
        repositoryDir,
        stagingDir,
        baseBranch: "main",
        pullRequestClient: client
      }),
      /already exists in the selected ledger/
    );

    assert.equal(client.created.length, 0);
    assert.equal(await git(repositoryDir, ["branch", "--list", "clarissimi/recognition/*"]), "");
  });
});

test("promote-draft rejects an unapproved draft before branch mutation", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const draftPath = join(repositoryDir, ".clarissimi", "drafts", "sample-project-42.json");
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await mkdir(join(repositoryDir, ".clarissimi", "drafts"), { recursive: true });
    await writeFile(
      draftPath,
      JSON.stringify(approvedDraftAssessment({ maintainerApprovalStatus: "draft" })),
      "utf8"
    );

    await assert.rejects(
      () => runActionPromoteDraft({
        mode: "promote-draft",
        draftPath,
        repositoryDir,
        stagingDir,
        baseBranch: "main",
        pullRequestClient: new FakePullRequestClient()
      }),
      /requires maintainerApprovalStatus approved or auto_approved/
    );
    assert.equal(
      await git(repositoryDir, ["branch", "--list", "clarissimi/recognition/merged_pull_request-42"]),
      ""
    );
  });
});

test("promote-draft rejects a draft inbox symlink that resolves outside the repository", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const externalDraftsDir = join(dir, "external-drafts");
    const draftPath = join(repositoryDir, ".clarissimi", "drafts", "approved.json");
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await mkdir(join(repositoryDir, ".clarissimi"), { recursive: true });
    await mkdir(externalDraftsDir);
    await writeFile(
      join(externalDraftsDir, "approved.json"),
      JSON.stringify(approvedDraftAssessment()),
      "utf8"
    );
    await symlink(externalDraftsDir, join(repositoryDir, ".clarissimi", "drafts"), "junction");

    await assert.rejects(
      () => runActionPromoteDraft({
        mode: "promote-draft",
        draftPath,
        repositoryDir,
        stagingDir: join(dir, "staged"),
        baseBranch: "main",
        pullRequestClient: new FakePullRequestClient()
      }),
      /resolves outside \.clarissimi\/drafts/
    );
  });
});

test("environment runner writes bounded propose outputs and step summary", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const fixturePath = join(dir, "github-fixture.json");
    const outputPath = join(dir, "github-output.txt");
    const summaryPath = join(dir, "step-summary.md");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_WORKSPACE: repositoryDir,
        GITHUB_REPOSITORY: "0disoft/clarissimi",
        INPUT_BASE_BRANCH: "main",
        INPUT_GITHUB_FIXTURE: fixturePath,
        INPUT_MODE: "propose",
        INPUT_STAGING_DIR: stagingDir,
        GITHUB_TOKEN: "test-token"
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      },
      {
        pullRequestClient: client
      }
    );
    const parsed = JSON.parse(stdout);
    const outputText = await readFile(outputPath, "utf8");
    const summaryText = await readFile(summaryPath, "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(parsed.mode, "propose");
    assert.equal(outputText.includes("proposal-pull-request-url=https://github.com/sample/project/pull/1"), true);
    assert.equal(outputText.includes("PATCH_EXCERPT_SENTINEL"), false);
    assert.equal(summaryText.includes("## Clarissimi propose summary"), true);
    assert.equal(summaryText.includes("PATCH_EXCERPT_SENTINEL"), false);
    assert.equal(client.created[0].repository, "0disoft/clarissimi");
  });
});

test("environment runner writes bounded stage-draft outputs and step summary", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const fixturePath = join(dir, "github-fixture.json");
    const outputPath = join(dir, "github-output.txt");
    const summaryPath = join(dir, "step-summary.md");
    const client = new FakePullRequestClient();
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await writeFile(
      fixturePath,
      JSON.stringify({
        ...githubFixture(),
        maintainerApprovalStatus: "draft"
      }),
      "utf8"
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_WORKSPACE: repositoryDir,
        GITHUB_REPOSITORY: "0disoft/clarissimi",
        INPUT_BASE_BRANCH: "main",
        INPUT_GITHUB_FIXTURE: fixturePath,
        INPUT_MODE: "stage-draft",
        INPUT_STAGING_DIR: stagingDir,
        GITHUB_TOKEN: "test-token"
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      },
      {
        pullRequestClient: client
      }
    );
    const parsed = JSON.parse(stdout);
    const outputText = await readFile(outputPath, "utf8");
    const summaryText = await readFile(summaryPath, "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(parsed.mode, "stage-draft");
    assert.equal(parsed.proposedEntryCount, 0);
    assert.equal(parsed.publicOutputsRendered, false);
    assert.equal(outputText.includes("mode=stage-draft"), true);
    assert.equal(outputText.includes("proposal-branch=clarissimi/drafts/merged_pull_request-42"), true);
    assert.equal(summaryText.includes("## Clarissimi stage-draft summary"), true);
    assert.equal(summaryText.includes("PATCH_EXCERPT_SENTINEL"), false);
    assert.equal(client.created[0].repository, "0disoft/clarissimi");
    assert.equal(client.created[0].body.includes("Drafts staged: 1"), true);
  });
});

test("environment propose mode routes merged pull request events through the live collector", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const remoteDir = join(dir, "remote.git");
    const stagingDir = join(dir, "staged");
    const eventPath = join(dir, "event.json");
    const outputPath = join(dir, "github-output.txt");
    const summaryPath = join(dir, "step-summary.md");
    const client = new FakePullRequestClient();
    const liveRequests = [];
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    await writeFile(eventPath, JSON.stringify(pullRequestEvent()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_WORKSPACE: repositoryDir,
        INPUT_BASE_BRANCH: "main",
        GITHUB_EVENT_PATH: eventPath,
        INPUT_MODE: "propose",
        INPUT_STAGING_DIR: stagingDir,
        GITHUB_TOKEN: "live-token"
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      },
      {
        fetch: async (url, init) => {
          liveRequests.push({
            url: String(url),
            authorization: init.headers.Authorization
          });

          if (String(url).endsWith("/pulls/42")) {
            return jsonResponse({
              number: 42,
              title: "Add parser regression coverage for #7",
              body: "LIVE_BODY_SENTINEL closes #8.",
              html_url: "https://github.com/sample/project/pull/42",
              merged_at: "2026-07-08T00:00:00.000Z",
              merge_commit_sha: "abc123def4567890",
              user: {
                id: 123456,
                login: "octocat",
                html_url: "https://github.com/octocat"
              },
              labels: [
                {
                  name: "tests"
                }
              ]
            });
          }

          if (String(url).includes("/files?")) {
            return jsonResponse([
              {
                filename: "tests/parser.spec.ts",
                status: "added",
                additions: 32,
                deletions: 0,
                patch: "PATCH_SENTINEL"
              }
            ]);
          }

          return jsonResponse([
            {
              id: 9001,
              body: "REVIEW_SENTINEL",
              html_url: "https://github.com/sample/project/pull/42#discussion_r9001",
              path: "tests/parser.spec.ts",
              diff_hunk: "@@ -0,0 +1,12 @@"
            }
          ]);
        },
        pullRequestClient: client
      }
    );
    const parsed = JSON.parse(stdout);
    const outputText = await readFile(outputPath, "utf8");
    const summaryText = await readFile(summaryPath, "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(parsed.inputSource, "github_event_path");
    assert.equal(parsed.mode, "propose");
    assert.equal(liveRequests.length, 3);
    assert.equal(liveRequests.every((request) => request.authorization === "Bearer live-token"), true);
    assert.equal(client.created.length, 1);
    assert.equal(outputText.includes("LIVE_BODY_SENTINEL"), false);
    assert.equal(summaryText.includes("PATCH_SENTINEL"), false);
    assert.equal(client.created[0].body.includes("REVIEW_SENTINEL"), false);
  });
});

async function initRepositoryWithRemote(repositoryDir, remoteDir) {
  await mkdir(repositoryDir);
  await git(repositoryDir, ["init", "-b", "main"]);
  await git(repositoryDir, ["config", "user.name", "Clarissimi Tests"]);
  await git(repositoryDir, ["config", "user.email", "clarissimi-tests.invalid"]);
  await writeFile(join(repositoryDir, "README.md"), "# Fixture Repository\n", "utf8");
  await git(repositoryDir, ["add", "README.md"]);
  await git(repositoryDir, ["commit", "-m", "Initial commit"]);
  await git(repositoryDir, ["init", "--bare", remoteDir]);
  await git(repositoryDir, ["remote", "add", "origin", remoteDir]);
  await git(repositoryDir, ["push", "origin", "main"]);
}

async function commitExistingLedger(repositoryDir, record) {
  const ledgerDir = join(repositoryDir, ".clarissimi");
  await mkdir(ledgerDir, { recursive: true });
  await writeFile(
    join(ledgerDir, "contributions.jsonl"),
    `${JSON.stringify(record)}\n`,
    "utf8"
  );
  await git(repositoryDir, ["add", ".clarissimi/contributions.jsonl"]);
  await git(repositoryDir, ["commit", "-m", "Add existing recognition ledger"]);
  await git(repositoryDir, ["push", "origin", "main"]);
}

async function remoteBranchSha(repositoryDir, branchName) {
  const output = await git(repositoryDir, ["ls-remote", "origin", `refs/heads/${branchName}`]);
  return output.split(/\s+/)[0];
}

function git(repositoryDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repositoryDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `git ${args.join(" ")} failed.`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

class FakePullRequestClient {
  created = [];

  async findOpenPullRequest() {
    return null;
  }

  async createPullRequest(input) {
    this.created.push(input);
    return {
      number: 1,
      url: "https://github.com/sample/project/pull/1",
      headBranch: input.headBranch,
      baseBranch: input.baseBranch,
      title: input.title
    };
  }

  async updatePullRequest() {
    throw new Error("updatePullRequest was not expected in this test.");
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}
