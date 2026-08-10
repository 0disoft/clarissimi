import { open, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";

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

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function writeTextFile(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
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

  try {
    return await task();
  } finally {
    await handle.close();
    await retryTransientFileOperation(() => rm(path, { force: true }));
  }
}

export async function writeTextFilesAtomically(
  entries: readonly { readonly path: string; readonly value: string }[],
  commitPointPath: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const uniqueEntries = new Map(entries.map((entry) => [entry.path, entry]));
  if (uniqueEntries.size !== entries.length || !uniqueEntries.has(commitPointPath)) {
    throw new Error("Atomic text generation requires unique paths and one commit point.");
  }

  for (const entry of uniqueEntries.values()) {
    await mkdir(dirname(entry.path), { recursive: true });
    try {
      const result = await stat(entry.path);
      if (!result.isFile()) {
        throw new Error(`Atomic text generation destination must be a file: ${entry.path}`);
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
  try {
    for (const entry of uniqueEntries.values()) {
      const temporaryPath = join(dirname(entry.path), `.${randomUUID()}.clarissimi-tmp`);
      await writeTemporaryFile(temporaryPath, entry.value, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      staged.push({ destination: entry.path, temporaryPath });
    }
    const ordered = staged
      .filter((entry) => entry.destination !== commitPointPath)
      .concat(staged.filter((entry) => entry.destination === commitPointPath));
    for (const entry of ordered) {
      await retryTransientFileOperation(() => renameFile(entry.temporaryPath, entry.destination));
    }
  } finally {
    await Promise.all(
      staged.map((entry) =>
        retryTransientFileOperation(() => removeFile(entry.temporaryPath, { force: true })),
      ),
    );
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
    return JSON.parse(input);
  } catch {
    throw new Error(`Invalid JSON in ${path}.`);
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
