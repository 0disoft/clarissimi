import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

import type { ProposalOutputStagingManifest, ProposalStagedFile } from "./staging.js";
import {
  ProposalBranchWriterError,
  assertChangedFilesAreOwned,
  assertCommittedFilesMatchManifest,
  assertOwnedStagedPath,
  readChangedFiles,
  restoreOwnedPaths,
} from "./branch-writer-support.js";

const proposalCommitAuthorName = "Clarissimi Bot";
const proposalCommitAuthorEmail = "clarissimi-bot@users.noreply.github.com";

export interface ProposalBranchWriterInput {
  readonly repositoryDir: string;
  readonly stagedOutputDir: string;
  readonly manifest: ProposalOutputStagingManifest;
  readonly baseBranch: string;
  readonly remoteName?: string;
  readonly expectedBaseCommitSha?: string;
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

export { ProposalBranchWriterError } from "./branch-writer-support.js";

export async function writeProposalBranch(
  input: ProposalBranchWriterInput,
): Promise<ProposalBranchWriteResult> {
  validateBranchWriterInput(input);

  const branchName = proposalBranchName(input.manifest);
  const baseCommitSha = await resolveProposalBase(
    input.repositoryDir,
    input.baseBranch,
    input.remoteName,
  );
  const originalRef = await currentRef(input.repositoryDir);
  const originalCommitSha = await git(input.repositoryDir, ["rev-parse", "HEAD"]);
  if (
    input.expectedBaseCommitSha !== undefined &&
    (baseCommitSha !== input.expectedBaseCommitSha || originalCommitSha !== baseCommitSha)
  ) {
    throw new ProposalBranchWriterError(
      "proposal_base_changed",
      "Checkout or proposal base changed during generation. Check out the selected base revision and rerun; no proposal files were written.",
    );
  }

  for (const file of input.manifest.files) {
    await assertSafeRepositoryOutputPath(input.repositoryDir, file.path);
  }
  await assertCleanWorktree(input.repositoryDir);

  const previousProposalSha = await assertExistingProposalBranchIsOwned(
    input.repositoryDir,
    baseCommitSha,
    branchName,
    input.manifest.files,
  );

  if (previousProposalSha !== undefined) {
    for (const file of input.manifest.files) {
      const content = await readFile(join(input.stagedOutputDir, file.path));
      if (createHash("sha256").update(content).digest("hex") !== file.sha256) {
        throw new ProposalBranchWriterError(
          "staged_file_hash_mismatch",
          `Staged file hash does not match manifest for ${file.path}.`,
        );
      }
      if (content.byteLength !== file.bytes) {
        throw new ProposalBranchWriterError(
          "staged_file_size_mismatch",
          `Staged file byte count does not match manifest for ${file.path}.`,
        );
      }
      const existing = await runGit(input.repositoryDir, [
        "show",
        `${previousProposalSha}:${file.path}`,
      ]);
      if (existing.exitCode !== 0 || existing.stdout !== content.toString("utf8")) {
        throw new ProposalBranchWriterError(
          "existing_branch_content_changed",
          "Existing proposal differs from the generated output. Review or close that proposal before regenerating it; maintainer edits and approval were preserved.",
        );
      }
    }
    await assertCommittedFilesMatchManifest(
      input,
      previousProposalSha,
      runGit,
      () =>
        new ProposalBranchWriterError(
          "committed_output_mismatch",
          "Existing proposal tree does not match the staged manifest.",
        ),
    );
    if (
      (await git(input.repositoryDir, ["merge-base", baseCommitSha, previousProposalSha])) !==
      baseCommitSha
    ) {
      throw new ProposalBranchWriterError(
        "existing_branch_base_changed",
        "Existing proposal has a different base. Review or close that proposal before regenerating it.",
      );
    }
    return {
      branchName,
      baseBranch: input.baseBranch,
      baseCommitSha,
      commitSha: previousProposalSha,
      changedFiles: await changedFilesFromBase(
        input.repositoryDir,
        baseCommitSha,
        previousProposalSha,
      ),
      rollbackHint: `Delete branch ${branchName} before merge to discard this proposal.`,
    };
  }

  let writeSucceeded = false;
  let branchReset = false;
  let proposalHeadSha = baseCommitSha;
  try {
    await git(input.repositoryDir, ["checkout", "-b", branchName, baseCommitSha]);
    branchReset = true;
    await writeStagedFilesToRepository(input);
    await git(input.repositoryDir, ["add", "--", ...input.manifest.files.map((file) => file.path)]);

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
        input.commitMessage ?? defaultCommitMessage(input.manifest),
      ]);
    }

    const commitSha = await git(input.repositoryDir, ["rev-parse", "HEAD"]);
    proposalHeadSha = commitSha;
    const changedFiles = await changedFilesFromBase(input.repositoryDir, baseCommitSha, commitSha);
    assertChangedFilesAreOwned(changedFiles, input.manifest.files);
    await assertCommittedFilesMatchManifest(
      input,
      commitSha,
      runGit,
      () =>
        new ProposalBranchWriterError(
          "committed_output_mismatch",
          "Committed proposal output differs from the staged manifest; no publishable result was returned.",
        ),
    );
    writeSucceeded = true;

    return {
      branchName,
      baseBranch: input.baseBranch,
      baseCommitSha,
      commitSha,
      changedFiles,
      rollbackHint: `Delete branch ${branchName} before merge to discard this proposal.`,
    };
  } finally {
    if (!writeSucceeded && branchReset) {
      await restoreOwnedPaths(input.repositoryDir, originalCommitSha, input.manifest.files, runGit);
      if (previousProposalSha !== undefined) {
        await git(input.repositoryDir, [
          "update-ref",
          `refs/heads/${branchName}`,
          previousProposalSha,
          proposalHeadSha,
        ]);
      }
    }
    await restoreRef(input.repositoryDir, originalRef);
  }
}

export async function assertProposalBaseCheckout(
  repositoryDir: string,
  baseBranch: string,
  remoteName?: string,
): Promise<string> {
  const base = await resolveProposalBase(repositoryDir, baseBranch, remoteName);
  const head = await git(repositoryDir, ["rev-parse", "HEAD"]);
  if (head !== base) {
    throw new ProposalBranchWriterError(
      "proposal_base_checkout_mismatch",
      "Current checkout differs from the selected proposal base. Check out that base revision before generating a proposal; its existing ledger must be retained.",
    );
  }
  return base;
}

async function resolveProposalBase(
  repositoryDir: string,
  baseBranch: string,
  remoteName = "origin",
): Promise<string> {
  const remoteRef = `refs/remotes/${remoteName}/${baseBranch}^{commit}`;
  const remote = await runGit(repositoryDir, ["rev-parse", "--verify", remoteRef]);
  if (remote.exitCode === 0) return remote.stdout.trim();
  return git(repositoryDir, ["rev-parse", "--verify", `${baseBranch}^{commit}`]);
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
      "Proposal branch writing requires a repository directory.",
    );
  }

  if (input.stagedOutputDir.trim().length === 0) {
    throw new ProposalBranchWriterError(
      "missing_staged_output_dir",
      "Proposal branch writing requires a staged output directory.",
    );
  }

  if (input.baseBranch.trim().length === 0) {
    throw new ProposalBranchWriterError(
      "missing_base_branch",
      "Proposal branch writing requires a base branch.",
    );
  }

  if (input.manifest.files.length === 0) {
    throw new ProposalBranchWriterError(
      "missing_staged_manifest",
      "Proposal branch writing requires staged files in the manifest.",
    );
  }

  input.manifest.files.forEach(assertOwnedStagedPath);
}

async function assertExistingProposalBranchIsOwned(
  repositoryDir: string,
  baseBranch: string,
  branchName: string,
  files: readonly ProposalStagedFile[],
): Promise<string | undefined> {
  const existing = await runGit(repositoryDir, ["rev-parse", "--verify", `${branchName}^{commit}`]);
  if (existing.exitCode !== 0) {
    return undefined;
  }

  // Use one immutable snapshot for ownership, content checks, and the returned result.
  const proposalSha = existing.stdout.trim();
  const changedFiles = await changedFilesFromBase(repositoryDir, baseBranch, proposalSha);
  const ownedPaths = new Set(files.map((file) => file.path));
  const outsideOwnedFiles = changedFiles.filter((file) => !ownedPaths.has(file));

  if (outsideOwnedFiles.length > 0) {
    throw new ProposalBranchWriterError(
      "existing_branch_has_unowned_changes",
      "Existing proposal branch has changes outside the staged Clarissimi output manifest.",
    );
  }
  return proposalSha;
}

async function assertCleanWorktree(repositoryDir: string): Promise<void> {
  const status = await git(repositoryDir, ["status", "--porcelain", "--untracked-files=all"]);
  if (status.length > 0) {
    throw new ProposalBranchWriterError(
      "dirty_worktree",
      "Proposal branch writing requires a clean worktree before writing recognition outputs.",
    );
  }
}

export async function writeStagedFilesToRepository(
  input: ProposalBranchWriterInput,
): Promise<void> {
  for (const file of input.manifest.files) {
    assertOwnedStagedPath(file);
    await assertSafeRepositoryOutputPath(input.repositoryDir, file.path);
    const content = await readFile(join(input.stagedOutputDir, file.path));
    const sha256 = createHash("sha256").update(content).digest("hex");

    if (sha256 !== file.sha256) {
      throw new ProposalBranchWriterError(
        "staged_file_hash_mismatch",
        `Staged file hash does not match manifest for ${file.path}.`,
      );
    }

    if (content.byteLength !== file.bytes) {
      throw new ProposalBranchWriterError(
        "staged_file_size_mismatch",
        `Staged file byte count does not match manifest for ${file.path}.`,
      );
    }

    const destination = join(input.repositoryDir, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

async function assertSafeRepositoryOutputPath(repositoryDir: string, path: string): Promise<void> {
  const repositoryRoot = await realpath(repositoryDir);
  let currentPath = repositoryRoot;

  for (const segment of normalize(path).split(sep)) {
    currentPath = join(currentPath, segment);

    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink() || (stats.isFile() && stats.nlink > 1)) {
        throw unsafeRepositoryOutputPathError();
      }

      const resolvedPath = await realpath(currentPath);
      const relativePath = relative(repositoryRoot, resolvedPath);
      if (
        relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
      ) {
        throw unsafeRepositoryOutputPathError();
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}

function unsafeRepositoryOutputPathError(): ProposalBranchWriterError {
  return new ProposalBranchWriterError(
    "unsafe_repository_output_path",
    "Proposal output paths must not traverse symbolic links, junctions, hard links, or the repository boundary.",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function changedFilesFromBase(
  repositoryDir: string,
  baseBranch: string,
  branchName: string,
): Promise<readonly string[]> {
  return readChangedFiles(
    repositoryDir,
    `${baseBranch}...${branchName}`,
    runGit,
    () =>
      new ProposalBranchWriterError(
        "git_command_failed",
        "Git diff failed while verifying proposal changes.",
      ),
  );
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
    "git diff --cached --quiet failed while checking staged proposal files.",
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

async function git(repositoryDir: string, args: readonly string[]): Promise<string> {
  const result = await runGit(repositoryDir, args);
  if (result.exitCode !== 0) {
    throw new ProposalBranchWriterError(
      "git_command_failed",
      result.stderr.trim() || `git ${args.join(" ")} failed.`,
    );
  }

  return result.stdout.trim();
}

async function gitExitCode(repositoryDir: string, args: readonly string[]): Promise<number> {
  return (await runGit(repositoryDir, args)).exitCode;
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
