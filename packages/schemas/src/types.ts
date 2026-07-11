export const ASSESSMENT_SCHEMA_VERSION = "clarissimi.assessment/v1" as const;

export const CONFIG_PROVIDERS = ["fake", "openai-compatible"] as const;

export type ConfigProvider = (typeof CONFIG_PROVIDERS)[number];

export const CONFIG_PROVIDER_THINKING_VALUES = ["disabled"] as const;

export type ConfigProviderThinking =
  (typeof CONFIG_PROVIDER_THINKING_VALUES)[number];

export const CONFIG_MODES = ["dry-run", "propose", "commit"] as const;

export type ConfigMode = (typeof CONFIG_MODES)[number];

export const CONFIG_MARKDOWN_SUMMARIES = ["none", "table"] as const;

export type ConfigMarkdownSummary = (typeof CONFIG_MARKDOWN_SUMMARIES)[number];

export const CONTRIBUTION_TYPES = [
  "bug_fix",
  "bug_report",
  "reproduction",
  "test",
  "performance",
  "documentation",
  "security",
  "accessibility",
  "api_design",
  "maintenance",
  "translation",
  "release_validation",
  "example",
  "other",
] as const;

export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export const IMPACT_LEVELS = ["low", "medium", "high"] as const;

export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export const APPROVAL_STATUSES = [
  "draft",
  "auto_approved",
  "approved",
  "rejected",
  "skipped",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const EVIDENCE_KINDS = [
  "pull_request",
  "issue",
  "review",
  "comment",
  "commit",
  "file",
  "label",
  "test",
  "maintainer_note",
  "advisory",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface ClarissimiConfig {
  readonly provider?: ConfigProvider;
  readonly providerEndpoint?: string;
  readonly providerModel?: string;
  readonly providerThinking?: ConfigProviderThinking;
  readonly mode?: ConfigMode;
  readonly markdownSummary?: ConfigMarkdownSummary;
}

export interface ContributorIdentity {
  readonly platform: "github";
  readonly id: string;
  readonly login: string;
  readonly profileUrl: string;
}

export interface EvidenceRef {
  readonly kind: EvidenceKind;
  readonly id: string;
  readonly url?: string;
  readonly title?: string;
  readonly excerpt?: string;
}

export interface RecognitionSource {
  readonly repository: string;
  readonly event: "merged_pull_request";
  readonly pullRequestNumber: number;
  readonly mergedAt?: string;
}

export interface ContributionAssessment {
  readonly schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION;
  readonly contributor: ContributorIdentity;
  readonly contributionType: ContributionType;
  readonly affectedArea: string;
  readonly impactLevel: ImpactLevel;
  readonly evidenceSummary: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly suggestedBadge: string;
  readonly publicRecognitionText: string;
  readonly confidence: number;
  readonly maintainerApprovalStatus: ApprovalStatus;
  readonly source: RecognitionSource;
}

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly issues: readonly [];
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
    };
