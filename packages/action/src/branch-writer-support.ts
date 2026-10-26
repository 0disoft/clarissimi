import { isAbsolute, normalize, sep } from "node:path";
import type { ProposalStagedFile } from "./staging.js";

type GitRunner = (
  cwd: string,
  args: readonly string[],
) => Promise<{ readonly exitCode: number; readonly stdout: string }>;

export class ProposalBranchWriterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProposalBranchWriterError";
    this.code = code;
  }
}

export function assertOwnedStagedPath(file: ProposalStagedFile): void {
  const normalized = normalize(file.path);
  const allowed = normalized === "CONTRIBUTORS.md" || normalized.startsWith(`.clarissimi${sep}`);

  if (
    isAbsolute(file.path) ||
    normalized.startsWith("..") ||
    normalized.includes(`${sep}..${sep}`) ||
    !allowed
  ) {
    throw new ProposalBranchWriterError(
      "unowned_staged_path",
      "Proposal branch writing only accepts Clarissimi-owned staged output paths.",
    );
  }

  if (file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new ProposalBranchWriterError(
      "invalid_staged_manifest",
      "Proposal branch writing requires valid staged file byte counts and sha256 hashes.",
    );
  }
}

export async function restoreOwnedPaths(
  repositoryDir: string,
  originalRef: string,
  files: readonly ProposalStagedFile[],
  runGit: GitRunner,
): Promise<void> {
  const git = async (cwd: string, args: readonly string[]): Promise<string> => {
    const result = await runGit(cwd, args);
    if (result.exitCode !== 0) {
      throw new ProposalBranchWriterError(
        "git_rollback_failed",
        "Owned output rollback could not inspect the checkout.",
      );
    }
    return result.stdout;
  };
  const paths = files.map((file) => file.path);
  const indexed = await git(repositoryDir, [
    "--literal-pathspecs",
    "ls-files",
    "--cached",
    "-z",
    "--",
    ...paths,
  ]);
  const original = await git(repositoryDir, [
    "--literal-pathspecs",
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    originalRef,
    "--",
    ...paths,
  ]);
  const trackedPaths = [...new Set([...indexed.split("\0"), ...original.split("\0")])].filter(
    (path) => path.length > 0,
  );
  if (trackedPaths.length > 0) {
    const restored = await runGit(repositoryDir, [
      "--literal-pathspecs",
      "restore",
      `--source=${originalRef}`,
      "--staged",
      "--worktree",
      "--",
      ...trackedPaths,
    ]);
    if (restored.exitCode !== 0) {
      throw new ProposalBranchWriterError(
        "git_rollback_failed",
        "Proposal branch writing failed and owned output rollback did not complete.",
      );
    }
  }
  const cleaned = await runGit(repositoryDir, [
    "--literal-pathspecs",
    "clean",
    "-f",
    "--",
    ...paths,
  ]);
  if (cleaned.exitCode !== 0) {
    throw new ProposalBranchWriterError(
      "git_rollback_failed",
      "Proposal branch writing failed and owned output rollback did not complete.",
    );
  }
}
