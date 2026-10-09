import {
  CONTRIBUTIONS_JSONL_PATH,
  RendererValidationError,
  assertUniqueContributionRecords,
  buildMaintainerRecentRecognitionShareDocument,
  parseContributionsJsonl,
} from "@clarissimi/renderers";

import { CliUsageError, getStringFlag, type ParsedArgs } from "./args.js";
import { CLI_EXIT_CODES, type CliExitCode } from "./exit-codes.js";
import { resolveFromCwd, type CliIo } from "./io.js";
import { readLedgerText } from "./ledger.js";
import { writeFailure, writeOutput } from "./output.js";

export async function runAnalytics(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const [subcommand, ...extraPositionals] = args.positionals;
  if (subcommand !== "recent-share" || extraPositionals.length > 0) {
    throw new CliUsageError("analytics requires the recent-share subcommand.");
  }

  const ledgerPath = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH,
  );
  const analyticsOptions = resolveAnalyticsOptions(args);

  try {
    const ledgerText = await readLedgerText(ledgerPath, {
      allowMissing: !args.flags.has("ledger"),
    });
    const records = parseContributionsJsonl(ledgerText);
    assertUniqueContributionRecords(records);
    const analytics = buildMaintainerRecentRecognitionShareDocument(records, analyticsOptions);

    writeOutput(io, args, {
      ok: true,
      command: "analytics",
      subcommand: "recent-share",
      ledgerPath,
      analytics,
      message: renderRecentShareMessage(analytics),
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }

    writeFailure(io, args, "analytics", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.invalidLedger
      : CLI_EXIT_CODES.writeFailure;
  }
}

function resolveAnalyticsOptions(
  args: ParsedArgs,
): Parameters<typeof buildMaintainerRecentRecognitionShareDocument>[1] {
  const options: Parameters<typeof buildMaintainerRecentRecognitionShareDocument>[1] = {};
  assignOptional(options, "asOf", parseIsoDateTimeFlag(args, "as-of"));
  assignOptional(options, "windowDays", parsePositiveIntegerFlag(args, "window-days"));
  try {
    // Reuse renderer validation and freeze the default cutoff before any ledger I/O.
    const { window } = buildMaintainerRecentRecognitionShareDocument([], options);
    return { asOf: window.asOf, windowDays: window.windowDays };
  } catch (error) {
    if (error instanceof RendererValidationError) {
      throw new CliUsageError(
        "--window-days and --as-of must define a window within the supported date range. Use a shorter window or a later cutoff.",
      );
    }
    throw error;
  }
}

function renderRecentShareMessage(
  value: ReturnType<typeof buildMaintainerRecentRecognitionShareDocument>,
): string {
  const lines = [
    "Recent recognition share calculated for maintainer review only.",
    `Window: ${value.window.startsAt} through ${value.window.asOf} (${value.window.windowDays} days)`,
    `Included records: ${value.window.includedRecords}`,
    `Total recognition weight: ${value.window.totalRecognitionWeight}`,
  ];

  value.contributors.forEach((entry) => {
    lines.push(
      `- ${entry.contributor.login}: ${formatPercentage(entry.recognitionShare)} ` +
        `of recent recognition weight across ${entry.recognitionCount} record(s)`,
    );
  });

  return lines.join("\n");
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function parsePositiveIntegerFlag(args: ParsedArgs, name: string): number | undefined {
  const value = getStringFlag(args, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`--${name} must be a positive integer.`);
  }

  return parsed;
}

function parseIsoDateTimeFlag(args: ParsedArgs, name: string): string | undefined {
  const value = getStringFlag(args, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new CliUsageError(`--${name} must be an ISO-compatible date time.`);
  }

  return new Date(parsed).toISOString();
}

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
