import { open, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";

const LOCK_RETRY_DELAY_MS = 50;
const LOCK_WAIT_TIMEOUT_MS = 30_000;

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

export async function withFileLock<T>(path: string, task: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (handle === undefined) {
    try {
      handle = await open(path, "wx", 0o600);
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
    await rm(path, { force: true });
  }
}

export async function writeTextFilesAtomically(
  entries: readonly { readonly path: string; readonly value: string }[],
  commitPointPath: string,
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

  const staged = await Promise.all(
    Array.from(uniqueEntries.values()).map(async (entry) => {
      const temporaryPath = join(dirname(entry.path), `.${randomUUID()}.clarissimi-tmp`);
      await writeFile(temporaryPath, entry.value, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return { destination: entry.path, temporaryPath };
    }),
  );

  try {
    const ordered = staged
      .filter((entry) => entry.destination !== commitPointPath)
      .concat(staged.filter((entry) => entry.destination === commitPointPath));
    for (const entry of ordered) {
      await rename(entry.temporaryPath, entry.destination);
    }
  } finally {
    await Promise.all(staged.map((entry) => rm(entry.temporaryPath, { force: true })));
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const result = await stat(path);
    return result.isFile();
  } catch {
    return false;
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
