import {
  isContributionType,
  isImpactLevel,
  type ContributionAssessmentHints,
} from "@clarissimi/schemas";
import { mergeRedactionReports, redactText } from "@clarissimi/redaction";
import type { PreparedProviderEvidence } from "./evidence.js";

export function prepareProviderHints(
  value: unknown,
  evidence: PreparedProviderEvidence,
): {
  readonly hints: ContributionAssessmentHints;
  readonly preparedEvidence: PreparedProviderEvidence;
} {
  const hints: {
    -readonly [K in keyof ContributionAssessmentHints]: ContributionAssessmentHints[K];
  } = {};
  const reports = [evidence.redactionReport];
  function invalid(field: string): never {
    throw new Error(`Provider hints.${field} has an invalid value.`);
  }
  if (value !== undefined) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Provider hints must be an object.");
    }
    const input = value as Record<string, unknown>;
    if (input.contributionType !== undefined) {
      if (typeof input.contributionType !== "string" || !isContributionType(input.contributionType))
        invalid("contributionType");
      hints.contributionType = input.contributionType;
    }
    if (input.impactLevel !== undefined) {
      if (typeof input.impactLevel !== "string" || !isImpactLevel(input.impactLevel))
        invalid("impactLevel");
      hints.impactLevel = input.impactLevel;
    }
    if (input.confidence !== undefined) {
      if (
        typeof input.confidence !== "number" ||
        !Number.isFinite(input.confidence) ||
        input.confidence < 0 ||
        input.confidence > 1
      )
        invalid("confidence");
      hints.confidence = input.confidence;
    }
    for (const field of ["affectedArea", "suggestedBadge"] as const) {
      const text = input[field];
      if (text === undefined) continue;
      if (typeof text !== "string" || text.trim().length === 0) invalid(field);
      const redacted = redactText(text);
      hints[field] = redacted.text;
      reports.push(redacted.report);
    }
  }
  return {
    hints,
    preparedEvidence: { ...evidence, redactionReport: mergeRedactionReports(reports) },
  };
}
