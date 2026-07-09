import type { PreparedProviderEvidence } from "@clarissimi/core";
import {
  ASSESSMENT_SCHEMA_VERSION,
  hasPublicRankingLanguage,
  validateContributionAssessment,
  type ContributionAssessment,
  type ContributionType,
  type EvidenceKind,
  type ImpactLevel,
  type ValidationIssue
} from "@clarissimi/schemas";

import type {
  ContributionDraftProvider,
  ProviderAssessmentHints,
  ProviderAssessmentInput
} from "./types.js";

const DEFAULT_PROVIDER_ID = "fake-deterministic";
const DEFAULT_AFFECTED_AREA = "repository maintenance";
const DEFAULT_BADGE = "Contribution Steward";
const DEFAULT_CONFIDENCE = 0.64;

export interface FakeProviderOptions {
  readonly id?: string;
  readonly defaults?: ProviderAssessmentHints;
}

export class FakeProviderAssessmentError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super("Fake provider produced an invalid contribution assessment.");
    this.name = "FakeProviderAssessmentError";
    this.issues = issues;
  }
}

export function createFakeContributionDraftProvider(
  options: FakeProviderOptions = {}
): ContributionDraftProvider {
  return {
    id: options.id ?? DEFAULT_PROVIDER_ID,
    async createAssessment(input: ProviderAssessmentInput): Promise<ContributionAssessment> {
      return createFakeAssessment(input, options.defaults);
    }
  };
}

export function createFakeAssessment(
  input: ProviderAssessmentInput,
  defaults: ProviderAssessmentHints = {}
): ContributionAssessment {
  const hints = input.hints ?? {};
  const contributionType =
    hints.contributionType ?? defaults.contributionType ?? inferContributionType(input.preparedEvidence);
  const affectedArea = safePublicNarrative(
    firstNonEmpty(
      hints.affectedArea,
      defaults.affectedArea,
      inferAffectedArea(input.preparedEvidence)
    ),
    DEFAULT_AFFECTED_AREA
  );
  const impactLevel = hints.impactLevel ?? defaults.impactLevel ?? inferImpactLevel(input.preparedEvidence);
  const suggestedBadge = safePublicNarrative(
    firstNonEmpty(
      hints.suggestedBadge,
      defaults.suggestedBadge,
      inferSuggestedBadge(contributionType)
    ),
    inferSuggestedBadge(contributionType)
  );
  const confidence = clampConfidence(hints.confidence ?? defaults.confidence ?? DEFAULT_CONFIDENCE);
  const assessment = {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    contributor: input.contributor,
    contributionType,
    affectedArea,
    impactLevel,
    evidenceSummary: buildEvidenceSummary(input.preparedEvidence, contributionType, affectedArea),
    evidenceRefs: input.preparedEvidence.evidenceRefs,
    suggestedBadge,
    publicRecognitionText: buildPublicRecognitionText(contributionType, affectedArea),
    confidence,
    maintainerApprovalStatus: "draft",
    source: input.preparedEvidence.source
  } satisfies ContributionAssessment;

  const result = validateContributionAssessment(assessment);
  if (!result.ok) {
    throw new FakeProviderAssessmentError(result.issues);
  }

  return result.value;
}

function inferContributionType(evidence: PreparedProviderEvidence): ContributionType {
  if (hasEvidenceKind(evidence, "test")) {
    return "test";
  }

  if (hasEvidenceKind(evidence, "advisory")) {
    return "security";
  }

  if (hasEvidenceKind(evidence, "issue")) {
    return "bug_report";
  }

  if (hasEvidenceKind(evidence, "file")) {
    return "maintenance";
  }

  return "other";
}

function inferImpactLevel(evidence: PreparedProviderEvidence): ImpactLevel {
  const evidenceCount = evidence.items.length;

  if (hasEvidenceKind(evidence, "advisory") || evidenceCount >= 4) {
    return "high";
  }

  if (hasEvidenceKind(evidence, "test") || evidenceCount >= 2) {
    return "medium";
  }

  return "low";
}

function inferAffectedArea(evidence: PreparedProviderEvidence): string {
  const item = evidence.items.find((candidate) => hasContent(candidate.title));
  return normalizeText(item?.title) ?? DEFAULT_AFFECTED_AREA;
}

function inferSuggestedBadge(contributionType: ContributionType): string {
  switch (contributionType) {
    case "test":
      return "Regression Shield";
    case "security":
      return "Security Care";
    case "bug_report":
      return "Problem Mapper";
    case "maintenance":
      return "Maintenance Steward";
    default:
      return DEFAULT_BADGE;
  }
}

function buildEvidenceSummary(
  evidence: PreparedProviderEvidence,
  contributionType: ContributionType,
  affectedArea: string
): string {
  const primary = evidence.items[0];
  const primaryLabel = primary === undefined ? "provided evidence" : `${primary.kind} ${primary.id}`;
  return `Drafted ${contributionType} recognition for ${affectedArea} from ${primaryLabel}.`;
}

function buildPublicRecognitionText(contributionType: ContributionType, affectedArea: string): string {
  switch (contributionType) {
    case "test":
      return `Added regression coverage for ${affectedArea}.`;
    case "security":
      return `Helped maintainers confirm security-sensitive evidence for ${affectedArea}.`;
    case "bug_report":
      return `Helped narrow a reported problem in ${affectedArea}.`;
    case "maintenance":
      return `Reduced maintenance work around ${affectedArea}.`;
    default:
      return `Helped improve ${affectedArea}.`;
  }
}

function hasEvidenceKind(evidence: PreparedProviderEvidence, kind: EvidenceKind): boolean {
  return evidence.items.some((item) => item.kind === kind);
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  return DEFAULT_AFFECTED_AREA;
}

function safePublicNarrative(value: string, fallback: string): string {
  return hasPublicRankingLanguage(value) ? fallback : value;
}

function normalizeText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function hasContent(value: string | undefined): boolean {
  return normalizeText(value) !== undefined;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIDENCE;
  }

  return Math.min(1, Math.max(0, value));
}
