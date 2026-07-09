import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

import type {
  ProposalOutputStagingManifest,
  ProposalStagedFile
} from "./staging.js";

const proposalCommitAuthorName = "Clarissimi Bot";
const proposalCommitAuthorEmail = "clarissimi-bot@users.noreply.github.com";

export interface ProposalBranchWriterInput {
  readonly repositoryDir: string;
  readonly stagedOutputDir: string;
  readonly manifest: ProposalOutputStagingManifest;
  readonly baseBranch: string;
  readonly commitMessage?: string;
}

export interface ProposalBranchWriteResult {
  readonly branchName: string;
  readonly baseBranch: string;
  readonly baseCommitSha: string;
  readonly commitSha: string;
  readonly changedFiles: readonly string[];
  readonly rollbackHint: string;
}

export class ProposalBranchWriterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProposalBranchWriterError";
    this.code = code;
  }
}

export async function writeProposalBranch(
  input: ProposalBranchWriterInput
): Promise<ProposalBranchWriteResult> {
  validateBranchWriterInput(input);

  const branchName = proposalBranchName(input.manifest);
  const baseCommitSha = await git(input.repositoryDir, [
    "rev-parse",
    "--verify",
    `${input.baseBranch}^{commit}`
  ]);
  const originalRef = await currentRef(input.repositoryDir);

  await assertExistingProposalBranchIsOwned(
    input.repositoryDir,
    input.baseBranch,
    branchName,
    input.manifest.files
  );

  try {
    await git(input.repositoryDir, ["checkout", "-B", branchName, input.baseBranch]);
    await writeStagedFilesToRepository(input);
    await git(input.repositoryDir, [
      "add",
      "--",
      ...input.manifest.files.map((file) => file.path)
    ]);

    const hasChanges = await hasCachedChanges(input.repositoryDir);
    if (hasChanges) {
      await git(input.repositoryDir, [
        "-c",
        `user.name=${proposalCommitAuthorName}`,
        "-c",
        `user.email=${proposalCommitAuthorEmail}`,
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        input.commitMessage ?? defaultCommitMessage(input.manifest)
      ]);
    }

    const commitSha = await git(input.repositoryDir, ["rev-parse", "HEAD"]);
    const changedFiles = await changedFilesFromBase(
      input.repositoryDir,
      input.baseBranch,
      branchName
    );

    return {
      branchName,
      baseBranch: input.baseBranch,
      baseCommitSha,
      commitSha,
      changedFiles,
      rollbackHint: `Delete branch ${branchName} before merge to discard this proposal.`
    };
  } finally {
    await restoreRef(input.repositoryDir, originalRef);
  }
}

export function proposalBranchName(manifest: ProposalOutputStagingManifest): string {
  const sourceKind = normalizeBranchSegment(manifest.source.event);
  const sourceId = String(manifest.source.pullRequestNumber);
  if (manifest.mode === "stage-draft") {
    return `clarissimi/drafts/${sourceKind}-${sourceId}`;
  }

  return `clarissimi/recognition/${sourceKind}-${sourceId}`;
}

function validateBranchWriterInput(input: ProposalBranchWriterInput): void {
  if (input.repositoryDir.trim().length === 0) {
    throw new ProposalBranchWriterError(
      "missing_repository_dir",
      "Proposal branch writing requires a repository directory."
    );
  }

  if (input.stagedOutputDir.trim().length === 0) {
    throw new ProposalBranchWriterError(
      "missing_staged_output_dir",
      "Proposal branch writing requires a staged output directory."
    );
  }

  if (input.baseBranch.trim().length === 0) {
    throw new ProposalBranchWriterError(
      "missing_base_branch",
      "Proposal branch writing requires a base branch."
    );
  }

  if (input.manifest.files.length === 0) {
    throw new ProposalBranchWriterError(
      "missing_staged_manifest",
      "Proposal branch writing requires staged files in the manifest."
    );
  }

  input.manifest.files.forEach(assertOwnedStagedPath);
}

async function assertExistingProposalBranchIsOwned(
  repositoryDir: string,
  baseBranch: string,
  branchName: string,
  files: readonly ProposalStagedFile[]
): Promise<void> {
  const exists = await gitOk(repositoryDir, ["rev-parse", "--verify", `${branchName}^{commit}`]);
  if (!exists) {
    return;
  }

  const changedFiles = await changedFilesFromBase(repositoryDir, baseBranch, branchName);
  const ownedPaths = new Set(files.map((file) => file.path));
  const outsideOwnedFiles = changedFiles.filter((file) => !ownedPaths.has(file));

  if (outsideOwnedFiles.length > 0) {
    throw new ProposalBranchWriterError(
      "existing_branch_has_unowned_changes",
      "Existing proposal branch has changes outside the staged Clarissimi output manifest."
    );
  }
}

async function writeStagedFilesToRepository(input: ProposalBranchWriterInput): Promise<void> {
  for (const file of input.manifest.files) {
    assertOwnedStagedPath(file);
    const content = await readFile(join(input.stagedOutputDir, file.path));
    const sha256 = createHash("sha256").update(content).digest("hex");

    if (sha256 !== file.sha256) {
      throw new ProposalBranchWriterError(
        "staged_file_hash_mismatch",
        `Staged file hash does not match manifest for ${file.path}.`
      );
    }

    if (content.byteLength !== file.bytes) {
      throw new ProposalBranchWriterError(
        "staged_file_size_mismatch",
        `Staged file byte count does not match manifest for ${file.path}.`
      );
    }

    const destination = join(input.repositoryDir, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

async function changedFilesFromBase(
  repositoryDir: string,
  baseBranch: string,
  branchName: string
): Promise<readonly string[]> {
  const output = await git(repositoryDir, [
    "diff",
    "--name-only",
    `${baseBranch}...${branchName}`
  ]);
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

async function hasCachedChanges(repositoryDir: string): Promise<boolean> {
  const exitCode = await gitExitCode(repositoryDir, ["diff", "--cached", "--quiet"]);
  if (exitCode === 0) {
    return false;
  }

  if (exitCode === 1) {
    return true;
  }

  throw new ProposalBranchWriterError(
    "git_command_failed",
    "git diff --cached --quiet failed while checking staged proposal files."
  );
}

async function currentRef(repositoryDir: string): Promise<string> {
  const branch = await git(repositoryDir, ["branch", "--show-current"]);
  if (branch.length > 0) {
    return branch;
  }

  return git(repositoryDir, ["rev-parse", "HEAD"]);
}

async function restoreRef(repositoryDir: string, ref: string): Promise<void> {
  if (ref.length === 0) {
    return;
  }

  await git(repositoryDir, ["checkout", ref]);
}

function assertOwnedStagedPath(file: ProposalStagedFile): void {
  const normalized = normalize(file.path);
  const allowed =
    normalized === "CONTRIBUTORS.md"
    || normalized.startsWith(`.clarissimi${sep}`);

  if (
    isAbsolute(file.path)
    || normalized.startsWith("..")
    || normalized.includes(`${sep}..${sep}`)
    || !allowed
  ) {
    throw new ProposalBranchWriterError(
      "unowned_staged_path",
      "Proposal branch writing only accepts Clarissimi-owned staged output paths."
    );
  }

  if (file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new ProposalBranchWriterError(
      "invalid_staged_manifest",
      "Proposal branch writing requires valid staged file byte counts and sha256 hashes."
    );
  }
}

function defaultCommitMessage(manifest: ProposalOutputStagingManifest): string {
  if (manifest.mode === "stage-draft") {
    return `Clarissimi draft review: ${manifest.source.event} #${manifest.source.pullRequestNumber}`;
  }

  return `Clarissimi recognition: ${manifest.source.event} #${manifest.source.pullRequestNumber}`;
}

function normalizeBranchSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function git(
  repositoryDir: string,
  args: readonly string[]
): Promise<string> {
  const result = await runGit(repositoryDir, args);
  if (result.exitCode !== 0) {
    throw new ProposalBranchWriterError(
      "git_command_failed",
      result.stderr.trim() || `git ${args.join(" ")} failed.`
    );
  }

  return result.stdout.trim();
}

async function gitOk(repositoryDir: string, args: readonly string[]): Promise<boolean> {
  return (await gitExitCode(repositoryDir, args)) === 0;
}

async function gitExitCode(repositoryDir: string, args: readonly string[]): Promise<number> {
  return (await runGit(repositoryDir, args)).exitCode;
}

function runGit(
  repositoryDir: string,
  args: readonly string[]
): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repositoryDir,
      stdio: ["ignore", "pipe", "pipe"]
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
        stderr
      });
    });
  });
}
