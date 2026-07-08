import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  runActionFromEnvironment,
  runActionPropose
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
