import { isAbsolute, join, normalize, sep } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

export async function assertCommittedFilesMatchManifest(
  input: {
    readonly repositoryDir: string;
    readonly stagedOutputDir: string;
    readonly manifest: { readonly files: readonly ProposalStagedFile[] };
  },
  commitSha: string,
  runGit: GitRunner,
  createError: () => Error,
): Promise<void> {
  const result = await runGit(input.repositoryDir, [
    "--literal-pathspecs",
    "ls-tree",
    "-r",
    "-z",
    "--full-tree",
    commitSha,
    "--",
    ...input.manifest.files.map((file) => file.path),
  ]);
  if (result.exitCode !== 0) throw createError();
  const blobs = new Map<string, string>();
  for (const entry of result.stdout.split("\0")) {
    const match = /^(?:100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(entry);
    if (match !== null) blobs.set(match[2]!, match[1]!);
  }
  for (const file of input.manifest.files) {
    const objectId = blobs.get(file.path);
    if (objectId === undefined) throw createError();
    const content = await readFile(join(input.stagedOutputDir, file.path));
    if (
      content.length !== file.bytes ||
      createHash("sha256").update(content).digest("hex") !== file.sha256
    )
      throw createError();
    const expectedObjectId = createHash(objectId.length === 40 ? "sha1" : "sha256")
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest("hex");
    if (objectId !== expectedObjectId) throw createError();
  }
}

export async function readChangedFiles(
  repositoryDir: string,
  range: string,
  runGit: GitRunner,
  createError: () => Error,
): Promise<readonly string[]> {
  // A final-tree diff hides files changed and then reverted in publishable history.
  // Compare merges against every parent; otherwise merge-only changes are omitted.
  const result = await runGit(repositoryDir, [
    "log",
    "--format=",
    "--root",
    "--diff-merges=separate",
    "--no-renames",
    "--name-only",
    "-z",
    range,
    "--",
  ]);
  if (result.exitCode !== 0) throw createError();
  // Preserve literal filenames, including leading whitespace, without Git quoting.
  return [...new Set(result.stdout.split("\0").filter((path) => path.length > 0))].sort();
}

export function assertChangedFilesAreOwned(
  changedFiles: readonly string[],
  files: readonly ProposalStagedFile[],
  createError: () => Error = () =>
    new ProposalBranchWriterError(
      "proposal_has_unowned_changes",
      "Proposal branch contains changes outside the staged Clarissimi output manifest.",
    ),
): void {
  const ownedPaths = new Set(files.map((file) => file.path));
  if (changedFiles.some((path) => !ownedPaths.has(path))) throw createError();
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
