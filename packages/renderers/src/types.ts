import type {
  ContributionAssessment,
  ContributionType,
  ContributorIdentity,
  EvidenceRef,
  RecognitionSource,
  ValidationIssue,
} from "@clarissimi/schemas";

export const CONTRIBUTIONS_JSONL_PATH =
  ".clarissimi/contributions.jsonl" as const;
export const DRAFTS_DIR_PATH = ".clarissimi/drafts" as const;
export const CONTRIBUTORS_JSON_PATH = ".clarissimi/contributors.json" as const;
export const CONTRIBUTORS_MARKDOWN_PATH = "CONTRIBUTORS.md" as const;
export const STATIC_DATA_JSON_PATH =
  ".clarissimi/static/contributions.json" as const;

export const CONTRIBUTORS_JSON_SCHEMA_VERSION =
  "clarissimi.contributors/v1" as const;
export const STATIC_DATA_SCHEMA_VERSION =
  "clarissimi.static-contributions/v1" as const;
export const MAINTAINER_ANALYTICS_SCHEMA_VERSION =
  "clarissimi.maintainer-analytics/v1" as const;

export type PublicContributionRecord = ContributionAssessment;
export type DraftReviewRecord = ContributionAssessment;

export interface PublicRecognitionSummary {
  readonly source: RecognitionSource;
  readonly contributionType: ContributionType;
  readonly affectedArea: string;
  readonly publicRecognitionText: string;
  readonly suggestedBadge: string;
  readonly evidenceRefs: readonly EvidenceRef[];
}

export interface ContributorRecognitionProfile {
  readonly contributor: ContributorIdentity;
  readonly contributionCount: number;
  readonly contributionTypes: readonly ContributionType[];
  readonly affectedAreas: readonly string[];
  readonly badges: readonly string[];
  readonly recognitions: readonly PublicRecognitionSummary[];
}

export interface ContributorsJsonDocument {
  readonly schemaVersion: typeof CONTRIBUTORS_JSON_SCHEMA_VERSION;
  readonly contributors: readonly ContributorRecognitionProfile[];
}

export interface StaticContributionRecord {
  readonly contributor: ContributorIdentity;
  readonly source: RecognitionSource;
  readonly contributionType: ContributionType;
  readonly affectedArea: string;
  readonly publicRecognitionText: string;
  readonly suggestedBadge: string;
  readonly evidenceRefs: readonly EvidenceRef[];
}

export interface StaticContributionsDocument {
  readonly schemaVersion: typeof STATIC_DATA_SCHEMA_VERSION;
  readonly contributions: readonly StaticContributionRecord[];
  readonly contributors: readonly ContributorRecognitionProfile[];
}

export interface MaintainerRecentRecognitionShareOptions {
  readonly asOf?: string;
  readonly windowDays?: number;
}

export interface MaintainerRecentRecognitionShareWindow {
  readonly asOf: string;
  readonly startsAt: string;
  readonly windowDays: number;
  readonly includedRecords: number;
  readonly excludedRecordsWithoutMergedAt: number;
  readonly totalRecognitionWeight: number;
}

export interface MaintainerRecentRecognitionShareContributor {
  readonly contributor: ContributorIdentity;
  readonly recognitionCount: number;
  readonly recognitionWeight: number;
  readonly recognitionShare: number;
  readonly contributionTypes: readonly ContributionType[];
  readonly affectedAreas: readonly string[];
}

export interface MaintainerRecentRecognitionShareDocument {
  readonly schemaVersion: typeof MAINTAINER_ANALYTICS_SCHEMA_VERSION;
  readonly scope: "maintainer-only";
  readonly metric: "recent_recognition_weight_share";
  readonly window: MaintainerRecentRecognitionShareWindow;
  readonly contributors: readonly MaintainerRecentRecognitionShareContributor[];
}

export interface RenderedRecognitionOutputs {
  readonly contributionsJsonl: string;
  readonly contributorsJson: string;
  readonly contributorsMarkdown: string;
  readonly staticDataJson: string;
}

export class RendererValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = "RendererValidationError";
    this.issues = issues;
  }
}
