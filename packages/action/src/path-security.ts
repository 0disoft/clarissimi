import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { readEnvInput } from "./environment.js";
import { ActionUsageError } from "./errors.js";

export async function resolveActionSummaryPath(
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const inputPath = readEnvInput(env.INPUT_SUMMARY_PATH);
  if (inputPath === undefined) {
    return undefined;
  }

  if (isAbsolute(inputPath)) {
    throw new ActionUsageError(
      "INPUT_SUMMARY_PATH must be a relative path inside GITHUB_WORKSPACE.",
    );
  }

  const workspace = resolve(readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd());
  const resolvedPath = resolve(workspace, inputPath);
  if (!isPathInside(workspace, resolvedPath)) {
    throw new ActionUsageError("INPUT_SUMMARY_PATH must stay inside GITHUB_WORKSPACE.");
  }

  const workspaceRoot = await realpath(workspace);
  let currentPath = workspaceRoot;
  const relativePath = relative(workspace, resolvedPath);
  const segments = relativePath.split(/[\\/]+/).filter((value) => value.length > 0);
  if (segments.length === 0) {
    throw new ActionUsageError("INPUT_SUMMARY_PATH must point to a file inside GITHUB_WORKSPACE.");
  }
  for (const [index, segment] of segments.entries()) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink() || (stats.isFile() && stats.nlink > 1)) {
        throw new ActionUsageError(
          "INPUT_SUMMARY_PATH must not traverse symbolic links, junctions, or hard links.",
        );
      }
      const isDestination = index === segments.length - 1;
      if (isDestination ? !stats.isFile() : !stats.isDirectory()) {
        throw new ActionUsageError(
          "INPUT_SUMMARY_PATH must point to a file whose parent paths are directories.",
        );
      }

      const resolvedCurrentPath = await realpath(currentPath);
      if (!isPathInside(workspaceRoot, resolvedCurrentPath)) {
        throw new ActionUsageError("INPUT_SUMMARY_PATH must stay inside GITHUB_WORKSPACE.");
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return resolvedPath;
}

export function isPathInside(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);
  return (
    relativePath.length === 0 ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
