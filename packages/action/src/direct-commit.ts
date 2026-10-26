import { spawn } from "node:child_process";

import { writeStagedFilesToRepository, type ProposalBranchWriterInput } from "./branch-writer.js";
import {
  assertChangedFilesAreOwned,
  assertCommittedFilesMatchManifest,
  assertOwnedStagedPath,
  readChangedFiles,
  restoreOwnedPaths,
} from "./branch-writer-support.js";
import type { ProposalOutputStagingManifest } from "./staging.js";

const commitAuthorName = "Clarissimi Bot";
const commitAuthorEmail = "clarissimi-bot@users.noreply.github.com";

export interface DirectCommitInput {
  readonly repositoryDir: string;
  readonly stagedOutputDir: string;
  readonly manifest: ProposalOutputStagingManifest;
  readonly targetBranch: string;
  readonly expectedHeadSha?: string;
  readonly commitMessage?: string;
}

export interface DirectCommitResult {
  readonly targetBranch: string;
  readonly baseCommitSha: string;
  readonly commitSha: string;
  readonly changedFiles: readonly string[];
  readonly commitCreated: boolean;
  readonly rollbackHint: string;
}

export interface DirectCommitPublisherInput {
  readonly repositoryDir: string;
  readonly commit: DirectCommitResult;
  readonly remoteName?: string;
}

export interface DirectCommitPublishResult {
  readonly remoteName: string;
  readonly targetBranch: string;
  readonly commitSha: string;
  readonly pushed: boolean;
  readonly rollbackHint: string;
}

export class DirectCommitError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DirectCommitError";
    this.code = code;
  }
}

export async function createDirectCommit(input: DirectCommitInput): Promise<DirectCommitResult> {
  validateDirectCommitInput(input);
  await assertValidBranchName(input.repositoryDir, input.targetBranch);
  await assertCleanWorktree(input.repositoryDir);

  const baseCommitSha = await git(input.repositoryDir, ["rev-parse", "HEAD"]);
  if (input.expectedHeadSha !== undefined && input.expectedHeadSha !== baseCommitSha) {
    throw new DirectCommitError(
      "expected_head_mismatch",
      "Direct commit mode refuses to write because HEAD does not match the expected source commit.",
    );
  }

  const writerInput: ProposalBranchWriterInput = {
    repositoryDir: input.repositoryDir,
    stagedOutputDir: input.stagedOutputDir,
    manifest: input.manifest,
    baseBranch: input.targetBranch,
  };
  try {
    await writeStagedFilesToRepository(writerInput);
    await git(input.repositoryDir, ["add", "--", ...input.manifest.files.map((file) => file.path)]);

    const commitCreated = await hasCachedChanges(input.repositoryDir);
    if (commitCreated) {
      await git(input.repositoryDir, [
        "-c",
        `user.name=${commitAuthorName}`,
        "-c",
        `user.email=${commitAuthorEmail}`,
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        input.commitMessage ?? defaultCommitMessage(input.manifest),
      ]);
    }

    const commitSha = await git(input.repositoryDir, ["rev-parse", "HEAD"]);
    const changedFiles = commitCreated
      ? await readChangedFiles(
          input.repositoryDir,
          `${baseCommitSha}..${commitSha}`,
          runGit,
          () =>
            new DirectCommitError(
              "git_command_failed",
              "Git diff failed while verifying direct commit changes.",
            ),
        )
      : [];
    assertChangedFilesAreOwned(
      changedFiles,
      input.manifest.files,
      () =>
        new DirectCommitError(
          "unowned_commit_changes",
          "Created commit contains changes outside the staged output manifest. The local commit was preserved for inspection; no publish result was returned.",
        ),
    );

    await assertCommittedFilesMatchManifest(
      input,
      commitSha,
      runGit,
      () =>
        new DirectCommitError(
          "committed_output_mismatch",
          "Committed output differs from the staged manifest. The local commit was preserved for inspection; no publishable result was returned.",
        ),
    );
    return {
      targetBranch: input.targetBranch,
      baseCommitSha,
      commitSha,
      changedFiles,
      commitCreated,
      rollbackHint: commitCreated
        ? `Revert commit ${commitSha} on ${input.targetBranch} to undo this recognition update.`
        : "No commit was created because the rendered recognition outputs were unchanged.",
    };
  } catch (error) {
    // The rejected commit already exists; preserve it instead of masking the
    // ownership failure with a second error from the HEAD-change rollback guard.
    if (
      error instanceof DirectCommitError &&
      (error.code === "unowned_commit_changes" || error.code === "committed_output_mismatch")
    )
      throw error;
    await rollbackUnpublishedCommit(input, baseCommitSha);
    throw error;
  }
}

export async function publishDirectCommit(
  input: DirectCommitPublisherInput,
): Promise<DirectCommitPublishResult> {
  const remoteName = input.remoteName ?? "origin";
  if (
    input.repositoryDir.trim().length === 0 ||
    remoteName.trim().length === 0 ||
    remoteName.startsWith("-")
  ) {
    throw new DirectCommitError(
      "missing_publish_metadata",
      "Direct commit publishing requires a repository directory and remote name.",
    );
  }

  await assertValidBranchName(input.repositoryDir, input.commit.targetBranch);
  const currentSha = await git(input.repositoryDir, ["rev-parse", "HEAD"]);
  if (currentSha !== input.commit.commitSha) {
    throw new DirectCommitError(
      "commit_sha_mismatch",
      "Direct commit publishing refuses to push because HEAD no longer matches the created commit.",
    );
  }

  if (input.commit.commitCreated) {
    const targetRef = `refs/heads/${input.commit.targetBranch}`;
    const remoteHead = await git(input.repositoryDir, [
      "ls-remote",
      "--refs",
      remoteName,
      targetRef,
    ]);
    if (remoteHead !== `${input.commit.baseCommitSha}\t${targetRef}`) {
      throw new DirectCommitError(
        "remote_base_mismatch",
        "Direct commit publishing requires the existing remote target branch to match the captured base commit. Rebuild from the current target branch; the local commit was preserved for inspection.",
      );
    }
    await git(input.repositoryDir, [
      "push",
      remoteName,
      // HEAD may move after preflight; publish only the verified commit.
      `${currentSha}:${targetRef}`,
    ]);
  }

  return {
    remoteName,
    targetBranch: input.commit.targetBranch,
    commitSha: input.commit.commitSha,
    pushed: input.commit.commitCreated,
    rollbackHint: input.commit.rollbackHint,
  };
}

async function rollbackUnpublishedCommit(
  input: DirectCommitInput,
  baseCommitSha: string,
): Promise<void> {
  if ((await git(input.repositoryDir, ["rev-parse", "HEAD"])) !== baseCommitSha) {
    throw new DirectCommitError(
      "rollback_failed",
      "Direct commit failed after HEAD changed. Automatic rollback was refused; inspect the preserved checkout before retrying.",
    );
  }
  try {
    await restoreOwnedPaths(input.repositoryDir, baseCommitSha, input.manifest.files, runGit);
  } catch {
    throw new DirectCommitError(
      "rollback_failed",
      "Direct commit failed and owned output rollback did not complete. Unrelated paths and HEAD were preserved.",
    );
  }
}

function validateDirectCommitInput(input: DirectCommitInput): void {
  if (
    input.repositoryDir.trim().length === 0 ||
    input.stagedOutputDir.trim().length === 0 ||
    input.targetBranch.trim().length === 0 ||
    input.manifest.files.length === 0
  ) {
    throw new DirectCommitError(
      "missing_commit_metadata",
      "Direct commit mode requires repository, staging, target branch, and staged file metadata.",
    );
  }

  input.manifest.files.forEach(assertOwnedStagedPath);

  if (input.expectedHeadSha !== undefined && !/^[a-f0-9]{40}$/i.test(input.expectedHeadSha)) {
    throw new DirectCommitError(
      "invalid_expected_head",
      "Direct commit mode requires expected-head to be a full Git commit SHA.",
    );
  }
}

async function assertCleanWorktree(repositoryDir: string): Promise<void> {
  const status = await git(repositoryDir, ["status", "--porcelain", "--untracked-files=all"]);
  if (status.length > 0) {
    throw new DirectCommitError(
      "dirty_worktree",
      "Direct commit mode requires a clean worktree before writing recognition outputs.",
    );
  }
}

async function assertValidBranchName(repositoryDir: string, branch: string): Promise<void> {
  const result = await runGit(repositoryDir, ["check-ref-format", "--branch", branch]);
  if (result.exitCode !== 0) {
    throw new DirectCommitError("invalid_target_branch", "Direct commit target branch is invalid.");
  }
}

async function hasCachedChanges(repositoryDir: string): Promise<boolean> {
  const result = await runGit(repositoryDir, ["diff", "--cached", "--quiet"]);
  if (result.exitCode === 0) {
    return false;
  }
  if (result.exitCode === 1) {
    return true;
  }

  throw new DirectCommitError(
    "git_command_failed",
    result.stderr.trim() || "git diff --cached --quiet failed.",
  );
}

function defaultCommitMessage(manifest: ProposalOutputStagingManifest): string {
  return `Clarissimi recognition: ${manifest.source.event} #${manifest.source.pullRequestNumber}`;
}

async function git(repositoryDir: string, args: readonly string[]): Promise<string> {
  const result = await runGit(repositoryDir, args);
  if (result.exitCode !== 0) {
    throw new DirectCommitError(
      "git_command_failed",
      result.stderr.trim() || `git ${args.join(" ")} failed.`,
    );
  }

  return result.stdout.trim();
}

function runGit(
  repositoryDir: string,
  args: readonly string[],
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repositoryDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}
