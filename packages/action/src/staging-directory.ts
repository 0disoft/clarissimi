import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ActionUsageError } from "./errors.js";
import { isPathInside } from "./path-security.js";

export async function assertSafeStagingDirectory(path: string): Promise<void> {
  let current = resolve(path);
  const systemTemp = resolve(tmpdir());
  while (true) {
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new ActionUsageError(
          "Staging directories must be directories without symbolic links or junctions; choose a separate temporary parent.",
        );
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const parent = dirname(current);
    if (current === systemTemp || parent === current) return;
    current = parent;
  }
}

export async function withActionStaging<
  T extends { readonly repositoryDir: string; readonly stagingDir: string },
  R,
>(input: T, task: (prepared: T) => Promise<R>): Promise<R> {
  const parent = resolve(input.stagingDir);
  const repository = await realpath(input.repositoryDir);
  await assertSafeStagingDirectory(parent);
  let existing = parent;
  while (true) {
    try {
      existing = await realpath(existing);
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      existing = dirname(existing);
    }
  }
  if (
    isPathInside(repository, parent) ||
    isPathInside(parent, repository) ||
    isPathInside(repository, existing)
  ) {
    throw new ActionUsageError(
      "Staging parent must not overlap the checkout. Choose a separate temporary directory outside the repository.",
    );
  }
  await mkdir(parent, { recursive: true });
  const stagingDir = await mkdtemp(join(parent, "clarissimi-"));
  let outcome:
    | { readonly ok: true; readonly value: R }
    | { readonly ok: false; readonly error: unknown };
  try {
    outcome = { ok: true, value: await task({ ...input, stagingDir }) };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    await rm(stagingDir, { recursive: true, force: true });
  } catch (error) {
    if (outcome.ok) throw error;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
