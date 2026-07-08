import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  ProposalBranchPublisherError,
  publishProposalBranch,
  stageProposalRecognitionOutputs,
  writeProposalBranch
} from "../dist/index.js";

const source = {
  repository: "sample/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z"
};

function assessment() {
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
    source
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-branch-publisher-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test("publishes a proposal branch without mutating remote main", async () => {
  await withTempDir(async (dir) => {
    const remoteDir = join(dir, "remote.git");
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    const remoteMainSha = await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 1
    });
    const branch = await writeProposalBranch({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      baseBranch: "main"
    });

    const result = await publishProposalBranch({
      repositoryDir,
      branch
    });

    assert.equal(result.remoteName, "origin");
    assert.equal(result.branchName, branch.branchName);
    assert.equal(result.commitSha, branch.commitSha);
    assert.equal(await remoteBranchSha(repositoryDir, branch.branchName), branch.commitSha);
    assert.equal(await git(repositoryDir, ["ls-remote", "origin", "refs/heads/main"]), remoteMainSha);
    assert.equal(result.rollbackHint.includes(`origin/${branch.branchName}`), true);
  });
});

test("rejects publishing when the local branch no longer matches the writer result", async () => {
  await withTempDir(async (dir) => {
    const remoteDir = join(dir, "remote.git");
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepositoryWithRemote(repositoryDir, remoteDir);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 0
    });
    const branch = await writeProposalBranch({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      baseBranch: "main"
    });

    await git(repositoryDir, ["checkout", branch.branchName]);
    await writeFile(join(repositoryDir, "CONTRIBUTORS.md"), "# Manual edit\n", "utf8");
    await git(repositoryDir, ["add", "CONTRIBUTORS.md"]);
    await git(repositoryDir, ["commit", "-m", "Change proposal branch after writer"]);
    await git(repositoryDir, ["checkout", "main"]);

    await assert.rejects(
      () =>
        publishProposalBranch({
          repositoryDir,
          branch
        }),
      (error) =>
        error instanceof ProposalBranchPublisherError
        && error.code === "branch_commit_mismatch"
    );
  });
});

test("rejects missing publisher metadata before git push", async () => {
  await assert.rejects(
    () =>
      publishProposalBranch({
        repositoryDir: "",
        branch: {
          branchName: "",
          baseBranch: "main",
          baseCommitSha: "1".repeat(40),
          commitSha: "2".repeat(40),
          changedFiles: ["CONTRIBUTORS.md"],
          rollbackHint: "Delete branch."
        }
      }),
    ProposalBranchPublisherError
  );
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
