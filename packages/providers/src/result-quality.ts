import {
  validateContributionAssessment,
  type ContributionAssessment,
  type EvidenceRef,
  type ValidationIssue,
  type ValidationResult,
} from "@clarissimi/schemas";

import type { ProviderAssessmentInput } from "./types.js";

const SECURITY_CLAIM_PATTERN =
  /\b(?:security|vulnerabilit(?:y|ies)|exploit|advisory|cve-\d{4}-\d{4,})\b/i;

export function validateProviderAssessmentResult(
  input: ProviderAssessmentInput,
  value: unknown,
): ValidationResult<ContributionAssessment> {
  const schemaResult = validateContributionAssessment(value);
  if (!schemaResult.ok) {
    return schemaResult;
  }

  const assessment = schemaResult.value;
  const issues: ValidationIssue[] = [];

  if (!sameContributor(assessment.contributor, input.contributor)) {
    issues.push({
      path: "$.contributor",
      code: "provider_result_identity_mismatch",
      message: "Provider results must preserve the trusted contributor identity.",
    });
  }

  if (!sameSource(assessment.source, input.preparedEvidence.source)) {
    issues.push({
      path: "$.source",
      code: "provider_result_source_mismatch",
      message: "Provider results must preserve the trusted recognition source.",
    });
  }

  if (!sameEvidenceRefs(assessment.evidenceRefs, input.preparedEvidence.evidenceRefs)) {
    issues.push({
      path: "$.evidenceRefs",
      code: "provider_result_evidence_mismatch",
      message: "Provider results must preserve the complete prepared evidence reference set.",
    });
  }

  if (assessment.maintainerApprovalStatus !== "draft") {
    issues.push({
      path: "$.maintainerApprovalStatus",
      code: "provider_result_approval_mismatch",
      message: "Provider results must remain drafts until maintainer policy approves them.",
    });
  }

  const securityClaim = hasSecurityClaim(assessment);
  const securitySupport = hasSecuritySupport(input);
  if (securityClaim && !securitySupport) {
    issues.push({
      path: "$.contributionType",
      code: "provider_result_security_support_missing",
      message:
        "Security recognition requires an advisory, security label, or security-specific test.",
    });
  }

  if (assessment.impactLevel === "high" && input.hints?.impactLevel !== "high") {
    issues.push({
      path: "$.impactLevel",
      code: "provider_result_high_impact_support_missing",
      message: "High impact requires an explicit maintainer hint.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: assessment, issues: [] };
}

function sameContributor(
  left: ContributionAssessment["contributor"],
  right: ProviderAssessmentInput["contributor"],
): boolean {
  return (
    left.platform === right.platform &&
    left.id === right.id &&
    left.login === right.login &&
    left.profileUrl === right.profileUrl &&
    left.kind === right.kind
  );
}

function sameSource(
  left: ContributionAssessment["source"],
  right: ProviderAssessmentInput["preparedEvidence"]["source"],
): boolean {
  return (
    left.repository === right.repository &&
    left.event === right.event &&
    left.pullRequestNumber === right.pullRequestNumber &&
    left.mergedAt === right.mergedAt
  );
}

function sameEvidenceRefs(left: readonly EvidenceRef[], right: readonly EvidenceRef[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((candidate, index) => {
    const expected = right[index];
    return (
      expected !== undefined &&
      candidate.kind === expected.kind &&
      candidate.id === expected.id &&
      candidate.url === expected.url &&
      candidate.title === expected.title &&
      candidate.excerpt === expected.excerpt
    );
  });
}

function hasSecurityClaim(assessment: ContributionAssessment): boolean {
  return (
    assessment.contributionType === "security" ||
    [
      assessment.affectedArea,
      assessment.evidenceSummary,
      assessment.suggestedBadge,
      assessment.publicRecognitionText,
    ].some((value) => SECURITY_CLAIM_PATTERN.test(value))
  );
}

function hasSecuritySupport(input: ProviderAssessmentInput): boolean {
  return input.preparedEvidence.items.some(
    (item) =>
      item.kind === "advisory" ||
      ((item.kind === "label" || item.kind === "test") &&
        [item.id, item.title].some(
          (value) => value !== undefined && SECURITY_CLAIM_PATTERN.test(value),
        )),
  );
}
