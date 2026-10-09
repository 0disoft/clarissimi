import { FakeProviderAssessmentError, OpenAiCompatibleProviderError } from "@clarissimi/providers";
import {
  RendererValidationError,
  toDraftReviewRecord,
  toPublicContributionRecord,
} from "@clarissimi/renderers";
import {
  publicValidationDiagnostics,
  type ContributionAssessment,
  type EvidenceRef,
} from "@clarissimi/schemas";

import { getBooleanFlag, type ParsedArgs } from "./args.js";
import { CliConfigError } from "./config.js";
import { CLI_EXIT_CODES, type CliExitCode } from "./exit-codes.js";
import type { CliIo } from "./io.js";

export function writeOutput(
  io: CliIo,
  args: ParsedArgs,
  value: Record<string, unknown>,
  humanDetails: readonly string[] = [],
): void {
  if (getBooleanFlag(args, "json")) {
    io.stdout(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  io.stdout([value.message ?? "Command completed.", ...humanDetails, ""].join("\n"));
}

export function classifyRecognitionFailure(error: unknown): CliExitCode {
  if (error instanceof CliConfigError) {
    return CLI_EXIT_CODES.invalidConfig;
  }
  if (error instanceof RendererValidationError) {
    return CLI_EXIT_CODES.policyRejection;
  }
  if (
    error instanceof FakeProviderAssessmentError ||
    (error instanceof OpenAiCompatibleProviderError && error.code === "invalid_assessment")
  ) {
    return CLI_EXIT_CODES.schemaValidationFailure;
  }
  return CLI_EXIT_CODES.providerFailure;
}

export function writeUsageFailure(
  io: CliIo,
  args: ParsedArgs | undefined,
  argv: readonly string[],
  message: string,
): CliExitCode {
  const normalizedMessage = message.trimEnd();
  if (isJsonRequested(args, argv)) {
    io.stdout(
      `${JSON.stringify(
        { ok: false, command: resolveCommandName(args, argv), message: normalizedMessage },
        null,
        2,
      )}\n`,
    );
  } else {
    io.stderr(`${normalizedMessage}\n`);
  }

  return CLI_EXIT_CODES.usage;
}

export function isJsonRequested(args: ParsedArgs | undefined, argv: readonly string[]): boolean {
  return args?.flags.get("json") === true || (args === undefined && argv.includes("--json"));
}

export function resolveCommandName(args: ParsedArgs | undefined, argv: readonly string[]): string {
  if (args !== undefined) {
    return args.command ?? "clarissimi";
  }

  const first = argv[0];
  return first !== undefined && !first.startsWith("--") ? first : "clarissimi";
}

export function writeFailure(io: CliIo, args: ParsedArgs, command: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const issues =
    error instanceof RendererValidationError ||
    error instanceof FakeProviderAssessmentError ||
    (error instanceof OpenAiCompatibleProviderError && error.code === "invalid_assessment")
      ? (error.issues ?? [])
      : [];
  const diagnostics = issues.length > 0 ? publicValidationDiagnostics(issues) : {};

  if (getBooleanFlag(args, "json")) {
    io.stdout(`${JSON.stringify({ ok: false, command, message, ...diagnostics }, null, 2)}\n`);
    return;
  }

  io.stderr(`${message}\n`);
  if (issues.length > 0) {
    const safe = publicValidationDiagnostics(issues);
    io.stderr(`Fields: ${safe.issuePaths.join(", ")} (${safe.issueCodes.join(", ")}).\n`);
    if (safe.recoveryHint !== undefined) io.stderr(`${safe.recoveryHint}\n`);
  }
}

type SanitizedContributionAssessment = Omit<ContributionAssessment, "evidenceRefs"> & {
  readonly evidenceRefs: readonly Omit<EvidenceRef, "excerpt">[];
};

export function sanitizeAssessmentForCliOutput(
  assessment: ContributionAssessment,
): SanitizedContributionAssessment {
  return assessment.maintainerApprovalStatus === "draft"
    ? toDraftReviewRecord(assessment)
    : toPublicContributionRecord(assessment);
}
