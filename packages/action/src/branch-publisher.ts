import { spawn } from "node:child_process";

import type { ProposalBranchWriteResult } from "./branch-writer.js";

export interface ProposalBranchPublisherInput {
  readonly repositoryDir: string;
  readonly branch: ProposalBranchWriteResult;
  readonly remoteName?: string;
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
): Promise<ProposalBranchPublishResult> {
  validatePublisherInput(input);

  const remoteName = input.remoteName ?? "origin";
  const localSha = await git(input.repositoryDir, ["rev-parse", input.branch.branchName]);
  if (localSha !== input.branch.commitSha) {
    throw new ProposalBranchPublisherError(
      "branch_commit_mismatch",
      "Proposal branch publisher refuses to push when the local branch no longer matches the branch writer result.",
    );
  }

  await git(input.repositoryDir, [
    "push",
    "--force-with-lease",
    remoteName,
    `${input.branch.branchName}:${input.branch.branchName}`,
  ]);

  return {
    remoteName,
    branchName: input.branch.branchName,
    commitSha: input.branch.commitSha,
    rollbackHint: `Delete remote branch ${remoteName}/${input.branch.branchName} before merge to discard this proposal.`,
  };
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

async function git(repositoryDir: string, args: readonly string[]): Promise<string> {
  const result = await runGit(repositoryDir, args);
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
