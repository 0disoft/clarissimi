import { join } from "node:path";
import {
  CONTRIBUTORS_JSON_PATH,
  CONTRIBUTORS_MARKDOWN_PATH,
  CONTRIBUTIONS_JSONL_PATH,
  STATIC_DATA_JSON_PATH,
  RendererValidationError,
  parseContributionsJsonl,
  renderContributionsJsonl,
} from "@clarissimi/renderers";
import { readLedgerRecords } from "./ledger.js";
import { assertLedgerIsSeparateFromOutputs, pathsReferToSameFile } from "./paths.js";

export async function planRenderedOutputs(
  outDir: string,
  sourceLedgerPath: string,
  outputs: {
    readonly contributionsJsonl: string;
    readonly contributorsJson: string;
    readonly contributorsMarkdown: string;
    readonly staticDataJson: string;
  },
  protectDestination = true,
): Promise<{
  readonly entries: readonly { readonly path: string; readonly value: string }[];
  readonly commitPointPath: string;
}> {
  const outputLedgerPath = join(outDir, CONTRIBUTIONS_JSONL_PATH);
  const sourceIsOutput = await pathsReferToSameFile(sourceLedgerPath, outputLedgerPath);
  const entries = [
    { path: join(outDir, CONTRIBUTORS_JSON_PATH), value: outputs.contributorsJson },
    { path: join(outDir, CONTRIBUTORS_MARKDOWN_PATH), value: outputs.contributorsMarkdown },
    { path: join(outDir, STATIC_DATA_JSON_PATH), value: outputs.staticDataJson },
  ];
  await assertLedgerIsSeparateFromOutputs(
    sourceLedgerPath,
    entries.map((entry) => entry.path),
  );
  if (!sourceIsOutput) {
    if (protectDestination) {
      const existing = await readLedgerRecords(outputLedgerPath, { allowMissing: true });
      const next = new Set(
        parseContributionsJsonl(outputs.contributionsJsonl).map((record) =>
          renderContributionsJsonl([record]),
        ),
      );
      if (existing.some((record) => !next.has(renderContributionsJsonl([record])))) {
        throw new RendererValidationError(
          "The output ledger contains records absent or changed in the selected input. Select the correct --ledger or a separate --out-dir; existing records were preserved.",
          [
            {
              path: "$.ledger",
              code: "output_ledger_conflict",
              message: "Rebuild cannot remove or change records in another ledger.",
            },
          ],
        );
      }
    }
    entries.push({ path: outputLedgerPath, value: outputs.contributionsJsonl });
  }
  return {
    entries,
    commitPointPath: sourceIsOutput ? join(outDir, STATIC_DATA_JSON_PATH) : outputLedgerPath,
  };
}
