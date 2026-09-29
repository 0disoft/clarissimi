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
const REGRESSION_CLAIM_PATTERN =
  /\b(?:regression (?:coverage|test|guard|prevention)|prevent(?:ed|s|ing)? (?:a )?regression)\b/i;
const MEASURED_PERFORMANCE_CLAIM_PATTERN =
  /\b(?:faster|speedup|lower latency|reduced latency|improved throughput|benchmark(?:ed)?)\b/i;
const MEASUREMENT_EVIDENCE_PATTERN =
  /\b(?:bench(?:mark)?|perf(?:ormance)?|latency|throughput|memory)\b/i;
const TEST_FILE_PATTERN =
  /(?:^|[/\\])[^/\\]+\.(?:test|spec)\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|cs|rb|php|swift)$/i;

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

  const evidenceMatches = sameEvidenceRefs(
    assessment.evidenceRefs,
    input.preparedEvidence.evidenceRefs,
  );
  if (!evidenceMatches) {
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

  if (assessment.claimEvidenceLinks === undefined) {
    issues.push({
      path: "$.claimEvidenceLinks",
      code: "provider_result_claim_evidence_missing",
      message: "Provider drafts must link both public narrative fields to prepared evidence.",
    });
  } else if (evidenceMatches) {
    const linkedItems = (indexes: readonly number[]) =>
      indexes.flatMap((index) => {
        const item = input.preparedEvidence.items[index];
        return item === undefined ? [] : [item];
      });
    const hasLinkedSecuritySupport = assessment.claimEvidenceLinks.some((link) =>
      linkedItems(link.evidenceRefIndexes).some(isSecuritySupportItem),
    );
    if (securityClaim && securitySupport && !hasLinkedSecuritySupport) {
      issues.push({
        path: "$.claimEvidenceLinks",
        code: "provider_result_security_claim_unlinked",
        message: "Security recognition must link to security-specific evidence.",
      });
    }
    const claimRules = [
      {
        pattern: SECURITY_CLAIM_PATTERN,
        supports: isSecuritySupportItem,
        enabled: securitySupport,
        code: "provider_result_security_claim_unlinked",
        message: "This security claim must link to security-specific evidence.",
      },
      {
        pattern: REGRESSION_CLAIM_PATTERN,
        supports: isRegressionEvidence,
        enabled: true,
        code: "provider_result_regression_claim_unlinked",
        message: "A regression-prevention claim must link to test evidence.",
      },
      {
        pattern: MEASURED_PERFORMANCE_CLAIM_PATTERN,
        supports: isMeasurementEvidence,
        enabled: true,
        code: "provider_result_performance_claim_unlinked",
        message: "A measured performance claim must link to measurement evidence.",
      },
    ] as const;
    for (const field of ["evidenceSummary", "publicRecognitionText"] as const) {
      const links = assessment.claimEvidenceLinks
        .map((link, index) => ({ link, index }))
        .filter(({ link }) => link.field === field);
      for (const rule of claimRules) {
        if (!rule.enabled) {
          continue;
        }
        for (const match of assessment[field].matchAll(new RegExp(rule.pattern.source, "gi"))) {
          const claimStart = match.index;
          const claimEnd = claimStart + match[0].length;
          let cursor = 0;
          for (const { link, index } of links) {
            const start = cursor;
            const end = start + link.text.length;
            cursor = end + 1;
            if (
              start < claimEnd &&
              end > claimStart &&
              !linkedItems(link.evidenceRefIndexes).some(rule.supports)
            ) {
              issues.push({
                path: `$.claimEvidenceLinks[${index}]`,
                code: rule.code,
                message: rule.message,
              });
            }
          }
        }
      }
    }
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
  return input.preparedEvidence.items.some(isSecuritySupportItem);
}

export function isSecuritySupportItem(
  item: ProviderAssessmentInput["preparedEvidence"]["items"][number],
): boolean {
  return (
    item.kind === "advisory" ||
    ((item.kind === "label" || item.kind === "test") &&
      [item.id, item.title].some(
        (value) => value !== undefined && SECURITY_CLAIM_PATTERN.test(value),
      ))
  );
}

export function isMeasurementEvidence(
  item: ProviderAssessmentInput["preparedEvidence"]["items"][number],
): boolean {
  return (
    (item.kind === "test" || item.kind === "maintainer_note") &&
    [item.id, item.title].some(
      (value) => value !== undefined && MEASUREMENT_EVIDENCE_PATTERN.test(value),
    )
  );
}

export function isRegressionClaimText(value: string): boolean {
  return REGRESSION_CLAIM_PATTERN.test(value);
}

export function isRegressionEvidence(
  item: ProviderAssessmentInput["preparedEvidence"]["items"][number],
): boolean {
  return item.kind === "test" || (item.kind === "file" && TEST_FILE_PATTERN.test(item.id));
}
