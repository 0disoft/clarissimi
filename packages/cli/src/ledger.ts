import { lstat, stat } from "node:fs/promises";
import { dirname } from "node:path";

import {
  RendererValidationError,
  assertUniqueContributionRecords,
  parseContributionsJsonl,
} from "@clarissimi/renderers";

import { readTextFile } from "./io.js";

export class CliLedgerValidationError extends RendererValidationError {
  constructor(error: RendererValidationError) {
    super(error.message, error.issues);
    this.name = "CliLedgerValidationError";
  }
}

export async function readLedgerRecords(
  path: string,
  options: { readonly allowMissing?: boolean } = {},
): Promise<ReturnType<typeof parseContributionsJsonl>> {
  try {
    const records = parseContributionsJsonl(await readLedgerText(path, options));
    assertUniqueContributionRecords(records);
    return records;
  } catch (error) {
    if (error instanceof RendererValidationError) {
      throw new CliLedgerValidationError(error);
    }
    throw error;
  }
}

export async function readLedgerText(
  path: string,
  options: { readonly allowMissing?: boolean } = {},
): Promise<string> {
  try {
    if (!(await stat(path)).isFile()) {
      throw invalidLedgerPath();
    }
    return await readTextFile(path);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error)) {
      throw error;
    }
    if (error.code === "EISDIR" || error.code === "ENOTDIR") {
      throw invalidLedgerPath();
    }
    if (error.code !== "ENOENT") {
      throw error;
    }
    await assertLedgerLinkTargetExists(path);
    // Windows can report ENOENT when a parent component is a file.
    await assertLedgerDirectoryParents(path);
    if (options.allowMissing === true) {
      return "";
    }
    throw new RendererValidationError("The selected canonical ledger file does not exist.", [
      {
        path: "$.ledger",
        code: "missing_ledger",
        message: "Select an existing ledger file before reading or rebuilding its outputs.",
      },
    ]);
  }
}

export async function assertLedgerDirectoryParents(path: string): Promise<void> {
  let ancestor = dirname(path);
  while (true) {
    try {
      if (!(await stat(ancestor)).isDirectory()) {
        throw invalidLedgerPath();
      }
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error)) {
        throw error;
      }
      if (error.code === "ENOTDIR") {
        throw invalidLedgerPath();
      }
      if (error.code !== "ENOENT") {
        throw error;
      }
      await assertLedgerLinkTargetExists(ancestor);
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      return;
    }
    ancestor = parent;
  }
}

async function assertLedgerLinkTargetExists(path: string): Promise<void> {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (entry.isSymbolicLink()) {
    throw new RendererValidationError(
      "The selected canonical ledger uses a symbolic link whose target does not exist. Restore its target or select a regular ledger file.",
      [
        {
          path: "$.ledger",
          code: "missing_ledger_link_target",
          message: "Restore the symbolic link target or select an existing JSONL ledger file.",
        },
      ],
    );
  }
}

function invalidLedgerPath(): RendererValidationError {
  return new RendererValidationError(
    "The selected canonical ledger path must be a regular file with directory parents.",
    [
      {
        path: "$.ledger",
        code: "invalid_ledger_path",
        message:
          "Select a JSONL ledger file inside a directory, rather than a directory or a path through a file.",
      },
    ],
  );
}
