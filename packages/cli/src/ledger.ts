import { RendererValidationError } from "@clarissimi/renderers";

import { readTextFile } from "./io.js";

export async function readLedgerText(
  path: string,
  options: { readonly allowMissing?: boolean } = {},
): Promise<string> {
  try {
    return await readTextFile(path);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
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
