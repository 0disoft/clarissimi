import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { CliUsageError } from "./args.js";
import { canonicalFilePath, fileExists } from "./io.js";

export async function assertLedgerIsSeparateFromOutputs(
  ledgerPath: string,
  outputPaths: readonly string[],
): Promise<void> {
  for (const outputPath of outputPaths) {
    if (await pathsReferToSameFile(ledgerPath, outputPath)) {
      throw new CliUsageError("A derived output path overlaps the selected canonical ledger.");
    }
  }
}

export async function pathsReferToSameFile(left: string, right: string): Promise<boolean> {
  if (pathKey(left) === pathKey(right)) {
    return true;
  }
  const [leftCanonical, rightCanonical] = await Promise.all([
    canonicalFilePath(left),
    canonicalFilePath(right),
  ]);
  if (pathKey(leftCanonical) === pathKey(rightCanonical)) {
    return true;
  }
  if (!(await fileExists(leftCanonical)) || !(await fileExists(rightCanonical))) {
    return false;
  }
  const [leftStat, rightStat] = await Promise.all([stat(leftCanonical), stat(rightCanonical)]);
  return leftStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
}

export function pathKey(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
