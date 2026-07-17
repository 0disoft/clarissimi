import { spawn } from "node:child_process";

import type { ProposalBranchWriteResult } from "./branch-writer.js";

export interface ProposalBranchPublisherInput {
  readonly repositoryDir: string;
  readonly branch: ProposalBranchWriteResult;
  readonly remoteName?: string;
}

export interface ProposalBranchPublisherRuntime {
  readonly runGit: (
    repositoryDir: string,
    args: readonly string[],
  ) => Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
}

export interface ProposalBranchPublishResult {
  readonly remoteName: string;
  readonly branchName: string;
  readonly commitSha: string;
  readonly rollbackHint: string;
}

export class ProposalBranchPublisherError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProposalBranchPublisherError";
    this.code = code;
  }
}

export async function publishProposalBranch(
  input: ProposalBranchPublisherInput,
  runtime: ProposalBranchPublisherRuntime = { runGit },
): Promise<ProposalBranchPublishResult> {
  validatePublisherInput(input);

  const remoteName = input.remoteName ?? "origin";
  const localSha = await git(runtime, input.repositoryDir, ["rev-parse", input.branch.branchName]);
  if (localSha !== input.branch.commitSha) {
    throw new ProposalBranchPublisherError(
      "branch_commit_mismatch",
      "Proposal branch publisher refuses to push when the local branch no longer matches the branch writer result.",
    );
  }

  const remoteRef = `refs/heads/${input.branch.branchName}`;
  const remoteSha = await remoteBranchSha(runtime, input.repositoryDir, remoteName, remoteRef);
  const pushResult = await runtime.runGit(input.repositoryDir, [
    "push",
    `--force-with-lease=${remoteRef}:${remoteSha ?? ""}`,
    remoteName,
    `${input.branch.branchName}:${remoteRef}`,
  ]);
  let publishedSha = localSha;
  if (pushResult.exitCode !== 0) {
    const equivalentWinnerSha = await reconcileEquivalentLeaseWinner(
      runtime,
      input,
      remoteName,
      remoteRef,
      localSha,
    );
    if (equivalentWinnerSha === undefined) {
      throw new ProposalBranchPublisherError(
        "git_command_failed",
        pushResult.stderr.trim() || "Proposal branch push failed.",
      );
    }
    publishedSha = equivalentWinnerSha;
  }

  return {
    remoteName,
    branchName: input.branch.branchName,
    commitSha: publishedSha,
    rollbackHint: `Delete remote branch ${remoteName}/${input.branch.branchName} before merge to discard this proposal.`,
  };
}

async function reconcileEquivalentLeaseWinner(
  runtime: ProposalBranchPublisherRuntime,
  input: ProposalBranchPublisherInput,
  remoteName: string,
  remoteRef: string,
  localSha: string,
): Promise<string | undefined> {
  try {
    const winnerSha = await remoteBranchSha(runtime, input.repositoryDir, remoteName, remoteRef);
    if (winnerSha === undefined) {
      return undefined;
    }
    if (winnerSha === localSha) {
      return winnerSha;
    }

    const fetchResult = await runtime.runGit(input.repositoryDir, [
      "fetch",
      "--no-tags",
      "--quiet",
      remoteName,
      remoteRef,
    ]);
    if (fetchResult.exitCode !== 0) {
      return undefined;
    }

    const fetchedSha = await git(runtime, input.repositoryDir, [
      "rev-parse",
      "--verify",
      "FETCH_HEAD^{commit}",
    ]);
    if (fetchedSha !== winnerSha) {
      return undefined;
    }

    const winnerParents = (
      await git(runtime, input.repositoryDir, ["rev-list", "--parents", "-n", "1", winnerSha])
    ).split(/\s+/);
    const hasExpectedBase =
      winnerSha === input.branch.baseCommitSha ||
      (winnerParents.length === 2 && winnerParents[1] === input.branch.baseCommitSha);
    if (!hasExpectedBase) {
      return undefined;
    }

    const [localTree, winnerTree] = await Promise.all([
      git(runtime, input.repositoryDir, ["rev-parse", `${localSha}^{tree}`]),
      git(runtime, input.repositoryDir, ["rev-parse", `${winnerSha}^{tree}`]),
    ]);
    if (localTree !== winnerTree) {
      return undefined;
    }

    const confirmedSha = await remoteBranchSha(runtime, input.repositoryDir, remoteName, remoteRef);
    return confirmedSha === winnerSha ? winnerSha : undefined;
  } catch {
    return undefined;
  }
}

async function remoteBranchSha(
  runtime: ProposalBranchPublisherRuntime,
  repositoryDir: string,
  remoteName: string,
  remoteRef: string,
): Promise<string | undefined> {
  const output = await git(runtime, repositoryDir, ["ls-remote", "--heads", remoteName, remoteRef]);
  if (output.length === 0) {
    return undefined;
  }

  const [sha, ref, ...extra] = output.split(/\s+/);
  if (sha === undefined || ref !== remoteRef || extra.length > 0 || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new ProposalBranchPublisherError(
      "invalid_remote_ref",
      "Proposal branch publisher received malformed remote branch metadata.",
    );
  }

  return sha;
}

function validatePublisherInput(input: ProposalBranchPublisherInput): void {
  if (input.repositoryDir.trim().length === 0) {
    throw new ProposalBranchPublisherError(
      "missing_repository_dir",
      "Proposal branch publishing requires a repository directory.",
    );
  }

  if (input.branch.branchName.trim().length === 0) {
    throw new ProposalBranchPublisherError(
      "missing_branch",
      "Proposal branch publishing requires a proposal branch name.",
    );
  }

  if (input.branch.commitSha.trim().length === 0) {
    throw new ProposalBranchPublisherError(
      "missing_commit_sha",
      "Proposal branch publishing requires a proposal branch commit sha.",
    );
  }

  if (input.remoteName !== undefined && input.remoteName.trim().length === 0) {
    throw new ProposalBranchPublisherError(
      "missing_remote",
      "Proposal branch publishing requires a non-empty remote name.",
    );
  }
}

async function git(
  runtime: ProposalBranchPublisherRuntime,
  repositoryDir: string,
  args: readonly string[],
): Promise<string> {
  const result = await runtime.runGit(repositoryDir, args);
  if (result.exitCode !== 0) {
    throw new ProposalBranchPublisherError(
      "git_command_failed",
      result.stderr.trim() || `git ${args.join(" ")} failed.`,
    );
  }

  return result.stdout.trim();
}

function runGit(
  repositoryDir: string,
  args: readonly string[],
): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
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
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
