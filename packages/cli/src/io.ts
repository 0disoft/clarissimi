import {
  open,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const LOCK_RETRY_DELAY_MS = 50;
const LOCK_WAIT_TIMEOUT_MS = 30_000;
const WINDOWS_FILE_OPERATION_RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400] as const;
const TRANSIENT_WINDOWS_FILE_OPERATION_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

export interface FileOperationRetryOptions {
  readonly platform?: NodeJS.Platform;
  readonly retryDelaysMs?: readonly number[];
  readonly wait?: (milliseconds: number) => Promise<void>;
}

export interface FileLockOptions extends FileOperationRetryOptions {
  readonly openFile?: typeof open;
}

export interface CliIo {
  readonly cwd: string;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: typeof fetch;
}

export function resolveFromCwd(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

export async function canonicalFilePath(path: string): Promise<string> {
  const absolutePath = resolve(path);
  try {
    return await realpath(absolutePath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    await assertSymlinkTargetExists(absolutePath);
  }

  const missingParts = [basename(absolutePath)];
  let ancestor = dirname(absolutePath);
  while (true) {
    try {
      return join(await realpath(ancestor), ...missingParts);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
      await assertSymlinkTargetExists(ancestor);
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw error;
      }
      missingParts.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

async function assertSymlinkTargetExists(path: string): Promise<void> {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (entry.isSymbolicLink()) {
    throw new Error(
      `Cannot resolve a symbolic link whose target does not exist: ${path}. Restore its target or select a regular file.`,
    );
  }
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function writeTextFile(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

export class ExclusiveFileExistsError extends Error {
  constructor(path: string) {
    super(`File already exists: ${path}`);
    this.name = "ExclusiveFileExistsError";
  }
}

export async function writeTextFileExclusive(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new ExclusiveFileExistsError(path);
    }
    throw error;
  }

  try {
    await handle.writeFile(value, "utf8");
  } catch (error) {
    await handle.close();
    await rm(path, { force: true });
    throw error;
  }
  await handle.close();
}

export async function withFileLock<T>(
  path: string,
  task: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const openFile = options.openFile ?? open;

  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (handle === undefined) {
    try {
      handle = await retryTransientFileOperation(() => openFile(path, "wx", 0o600), options);
      break;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for file lock ${path}.`);
      }
      await delay(LOCK_RETRY_DELAY_MS);
    }
  }

  if (handle === undefined) {
    throw new Error(`Unable to acquire file lock ${path}.`);
  }

  const owner = `${JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    token: randomUUID(),
  })}\n`;
  let ownerWritten = false;
  let outcome:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: unknown };
  try {
    await retryTransientFileOperation(() => handle.writeFile(owner, "utf8"), options);
    ownerWritten = true;
    outcome = { ok: true, value: await task() };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    await handle.close();
    if (ownerWritten) {
      const currentOwner = await retryTransientFileOperation(() => readFile(path, "utf8"), options);
      if (currentOwner !== owner) {
        throw new Error(`File lock ownership changed before release: ${path}.`);
      }
    }
    await retryTransientFileOperation(() => rm(path, { force: true }), options);
  } catch (error) {
    // Preserve the original error instance so cleanup cannot change the CLI failure category.
    throw outcome.ok ? error : outcome.error;
  }
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

export async function writeTextFilesAtomically(
  entries: readonly { readonly path: string; readonly value: string }[],
  commitPointPath: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const requestedEntries = new Map(entries.map((entry) => [entry.path, entry]));
  if (requestedEntries.size !== entries.length || !requestedEntries.has(commitPointPath)) {
    throw new Error("Atomic text generation requires unique paths and one commit point.");
  }

  const uniqueEntries = new Map<string, { readonly path: string; readonly value: string }>();
  let resolvedCommitPointPath = commitPointPath;
  for (const entry of requestedEntries.values()) {
    const path = await canonicalFilePath(entry.path);
    const key = process.platform === "win32" ? path.toLowerCase() : path;
    if (uniqueEntries.has(key)) {
      throw new Error(
        "Atomic text generation outputs refer to the same destination. Select separate files for each output.",
      );
    }
    uniqueEntries.set(key, { path, value: entry.value });
    if (entry.path === commitPointPath) {
      resolvedCommitPointPath = path;
    }
  }

  for (const entry of uniqueEntries.values()) {
    await mkdir(dirname(entry.path), { recursive: true });
    try {
      const result = await stat(entry.path);
      if (!result.isFile()) {
        throw new Error(`Atomic text generation destination must be a file: ${entry.path}`);
      }
      if (result.nlink > 1) {
        throw new Error(
          `Cannot atomically replace a file with multiple hard links: ${entry.path}. Copy it to a separate file before writing.`,
        );
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const staged: { destination: string; temporaryPath: string }[] = [];
  const writeTemporaryFile = options.writeFile ?? writeFile;
  const renameFile = options.rename ?? rename;
  const removeFile = options.rm ?? rm;
  let generationFailure: { readonly error: unknown } | undefined;
  try {
    for (const entry of uniqueEntries.values()) {
      const temporaryPath = join(dirname(entry.path), `.${randomUUID()}.clarissimi-tmp`);
      staged.push({ destination: entry.path, temporaryPath });
      try {
        await writeTemporaryFile(temporaryPath, entry.value, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        if (isNodeError(error) && error.code === "EEXIST") {
          staged.pop();
        }
        throw error;
      }
    }
    const ordered = staged
      .filter((entry) => entry.destination !== resolvedCommitPointPath)
      .concat(staged.filter((entry) => entry.destination === resolvedCommitPointPath));
    for (const entry of ordered) {
      await retryTransientFileOperation(() => renameFile(entry.temporaryPath, entry.destination));
    }
  } catch (error) {
    generationFailure = { error };
  }
  const cleanupResults = await Promise.allSettled(
    staged.map((entry) =>
      retryTransientFileOperation(() => removeFile(entry.temporaryPath, { force: true })),
    ),
  );
  if (generationFailure !== undefined) {
    throw generationFailure.error;
  }
  const cleanupFailure = cleanupResults.find((result) => result.status === "rejected");
  if (cleanupFailure?.status === "rejected") {
    throw cleanupFailure.reason;
  }
}

export interface AtomicWriteOptions {
  readonly writeFile?: typeof writeFile;
  readonly rename?: typeof rename;
  readonly rm?: typeof rm;
}

export async function retryTransientFileOperation<T>(
  operation: () => Promise<T>,
  options: FileOperationRetryOptions = {},
): Promise<T> {
  const platform = options.platform ?? process.platform;
  const retryDelaysMs = options.retryDelaysMs ?? WINDOWS_FILE_OPERATION_RETRY_DELAYS_MS;
  const wait = options.wait ?? delay;
  let retryIndex = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      const retryDelayMs = retryDelaysMs[retryIndex];
      if (
        platform !== "win32" ||
        retryDelayMs === undefined ||
        !isTransientWindowsFileOperationError(error)
      ) {
        throw error;
      }

      retryIndex += 1;
      await wait(retryDelayMs);
    }
  }
}

export async function fileExists(path: string, statFile: typeof stat = stat): Promise<boolean> {
  try {
    const result = await statFile(path);
    return result.isFile();
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return false;
    }
    throw error;
  }
}

export function parseJsonText(input: string, path: string): unknown {
  try {
    return JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch (error) {
    // V8 may include input excerpts; expose only its numeric location suffix.
    const location =
      error instanceof SyntaxError
        ? /\(line ([1-9]\d*) column ([1-9]\d*)\)$/.exec(error.message)
        : null;
    const detail = location === null ? "" : ` at line ${location[1]}, column ${location[2]}`;
    throw new Error(`Invalid JSON in ${path}${detail}.`);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isTransientWindowsFileOperationError(error: unknown): boolean {
  return isNodeError(error) && TRANSIENT_WINDOWS_FILE_OPERATION_CODES.has(error.code ?? "");
}
