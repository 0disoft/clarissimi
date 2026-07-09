import {
  APPROVAL_STATUSES,
  ASSESSMENT_SCHEMA_VERSION,
  CONFIG_MODES,
  CONFIG_PROVIDERS,
  CONFIG_PROVIDER_THINKING_VALUES,
  CONTRIBUTION_TYPES,
  EVIDENCE_KINDS,
  IMPACT_LEVELS,
  type ApprovalStatus,
  type ClarissimiConfig,
  type ContributionAssessment,
  type ConfigMode,
  type ConfigProvider,
  type ConfigProviderThinking,
  type ContributionType,
  type EvidenceKind,
  type ValidationIssue,
  type ValidationResult
} from "./types.js";

const RANKING_LANGUAGE_PATTERNS: readonly RegExp[] = [
  /\bleaderboard\b/i,
  /\btotal\s+score\b/i,
  /\baverage\s+score\b/i,
  /\bhigh\s+score\b/i,
  /\bcontribution\s+points\b/i,
  /\bleaderboard\s+points\b/i,
  /\bcontributor\s+tier\b/i,
  /\brank(?:ed|ing)?\b/i,
  /\btop\s+\d+\s+contributor\b/i,
  /\b(?:gold|silver|bronze)\s+contributor\b/i,
  /\bmedium\s+contributor\b/i,
  /\bmedium\s+quality\b/i,
  /\blow-quality\s+contributor\b/i
];

const PUBLIC_SCORE_FIELD_NAMES = new Set([
  "score",
  "totalScore",
  "averageScore",
  "rank",
  "ranking",
  "leaderboard",
  "leaderboardPosition",
  "contributorTier",
  "tier",
  "points"
]);

export function isContributionType(value: string): value is ContributionType {
  return (CONTRIBUTION_TYPES as readonly string[]).includes(value);
}

export function isConfigProvider(value: string): value is ConfigProvider {
  return (CONFIG_PROVIDERS as readonly string[]).includes(value);
}

export function isConfigProviderThinking(value: string): value is ConfigProviderThinking {
  return (CONFIG_PROVIDER_THINKING_VALUES as readonly string[]).includes(value);
}

export function isConfigMode(value: string): value is ConfigMode {
  return (CONFIG_MODES as readonly string[]).includes(value);
}

export function isImpactLevel(value: string): value is ContributionAssessment["impactLevel"] {
  return (IMPACT_LEVELS as readonly string[]).includes(value);
}

export function isApprovalStatus(value: string): value is ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(value);
}

export function isEvidenceKind(value: string): value is EvidenceKind {
  return (EVIDENCE_KINDS as readonly string[]).includes(value);
}

export function hasPublicRankingLanguage(value: string): boolean {
  return RANKING_LANGUAGE_PATTERNS.some((pattern) => pattern.test(value));
}

export function validateContributionAssessment(
  value: unknown
): ValidationResult<ContributionAssessment> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return invalid([
      {
        path: "$",
        code: "expected_object",
        message: "Assessment must be an object."
      }
    ]);
  }

  expectLiteral(value.schemaVersion, ASSESSMENT_SCHEMA_VERSION, "$.schemaVersion", issues);
  rejectPublicScoreFields(value, "$", issues);
  validateContributor(value.contributor, "$.contributor", issues);
  expectEnum(value.contributionType, isContributionType, "$.contributionType", issues);
  expectPublicNarrativeText(value.affectedArea, "$.affectedArea", issues);
  expectEnum(value.impactLevel, isImpactLevel, "$.impactLevel", issues);
  expectPublicNarrativeText(value.evidenceSummary, "$.evidenceSummary", issues);
  validateEvidenceRefs(value.evidenceRefs, "$.evidenceRefs", issues);
  expectPublicNarrativeText(value.suggestedBadge, "$.suggestedBadge", issues);
  expectPublicNarrativeText(value.publicRecognitionText, "$.publicRecognitionText", issues);
  expectConfidence(value.confidence, "$.confidence", issues);
  expectEnum(value.maintainerApprovalStatus, isApprovalStatus, "$.maintainerApprovalStatus", issues);
  validateSource(value.source, "$.source", issues);

  if (issues.length > 0) {
    return invalid(issues);
  }

  return {
    ok: true,
    value: value as unknown as ContributionAssessment,
    issues: []
  };
}

export function validateClarissimiConfig(value: unknown): ValidationResult<ClarissimiConfig> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return invalid([
      {
        path: "$",
        code: "expected_object",
        message: "Clarissimi config must be a JSON object."
      }
    ]);
  }

  const provider = expectOptionalEnum(value.provider, isConfigProvider, "$.provider", issues);
  const providerEndpoint = expectOptionalNonEmptyString(
    value.providerEndpoint,
    "$.providerEndpoint",
    issues
  );
  const providerModel = expectOptionalNonEmptyString(value.providerModel, "$.providerModel", issues);
  const providerThinking = expectOptionalEnum(
    value.providerThinking,
    isConfigProviderThinking,
    "$.providerThinking",
    issues
  );
  const mode = expectOptionalEnum(value.mode, isConfigMode, "$.mode", issues);

  if (issues.length > 0) {
    return invalid(issues);
  }

  const config: {
    provider?: ConfigProvider;
    providerEndpoint?: string;
    providerModel?: string;
    providerThinking?: ConfigProviderThinking;
    mode?: ConfigMode;
  } = {};

  if (provider !== undefined) {
    config.provider = provider;
  }

  if (providerEndpoint !== undefined) {
    config.providerEndpoint = providerEndpoint;
  }

  if (providerModel !== undefined) {
    config.providerModel = providerModel;
  }

  if (providerThinking !== undefined) {
    config.providerThinking = providerThinking;
  }

  if (mode !== undefined) {
    config.mode = mode;
  }

  return {
    ok: true,
    value: config,
    issues: []
  };
}

function validateContributor(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    pushIssue(issues, path, "expected_object", "Contributor must be an object.");
    return;
  }

  expectLiteral(value.platform, "github", `${path}.platform`, issues);
  expectNonEmptyString(value.id, `${path}.id`, issues);
  expectNonEmptyString(value.login, `${path}.login`, issues);
  expectUrl(value.profileUrl, `${path}.profileUrl`, issues);
}

function validateEvidenceRefs(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, path, "expected_array", "Evidence refs must be an array.");
    return;
  }

  if (value.length === 0) {
    pushIssue(issues, path, "empty_array", "At least one evidence ref is required.");
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!isRecord(entry)) {
      pushIssue(issues, entryPath, "expected_object", "Evidence ref must be an object.");
      return;
    }

    expectEnum(entry.kind, isEvidenceKind, `${entryPath}.kind`, issues);
    expectNonEmptyString(entry.id, `${entryPath}.id`, issues);

    if (entry.url !== undefined) {
      expectUrl(entry.url, `${entryPath}.url`, issues);
    }

    if (entry.title !== undefined) {
      expectNonEmptyString(entry.title, `${entryPath}.title`, issues);
    }

    if (entry.excerpt !== undefined) {
      expectNonEmptyString(entry.excerpt, `${entryPath}.excerpt`, issues);
    }
  });
}

function validateSource(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    pushIssue(issues, path, "expected_object", "Source must be an object.");
    return;
  }

  expectRepositoryName(value.repository, `${path}.repository`, issues);
  expectLiteral(value.event, "merged_pull_request", `${path}.event`, issues);
  expectPositiveInteger(value.pullRequestNumber, `${path}.pullRequestNumber`, issues);

  if (value.mergedAt !== undefined) {
    expectIsoDateTime(value.mergedAt, `${path}.mergedAt`, issues);
  }
}

function expectPublicNarrativeText(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  expectNonEmptyString(value, path, issues);

  if (typeof value === "string" && hasPublicRankingLanguage(value)) {
    pushIssue(
      issues,
      path,
      "public_ranking_language",
      "Public recognition fields must not contain contributor scoring or ranking language."
    );
  }
}

function expectConfidence(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushIssue(issues, path, "expected_number", "Confidence must be a finite number.");
    return;
  }

  if (value < 0 || value > 1) {
    pushIssue(issues, path, "out_of_range", "Confidence must be between 0 and 1.");
  }
}

function rejectPublicScoreFields(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      rejectPublicScoreFields(entry, `${path}[${index}]`, issues);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    if (PUBLIC_SCORE_FIELD_NAMES.has(key)) {
      pushIssue(
        issues,
        fieldPath,
        "public_score_field",
        "Assessment must not contain public score, rank, leaderboard, point, or contributor tier fields."
      );
    }

    rejectPublicScoreFields(nestedValue, fieldPath, issues);
  }
}

function expectEnum(
  value: unknown,
  guard: (candidate: string) => boolean,
  path: string,
  issues: ValidationIssue[]
): void {
  if (typeof value !== "string" || !guard(value)) {
    pushIssue(issues, path, "invalid_enum", "Value is not in the allowed set.");
  }
}

function expectLiteral(
  value: unknown,
  expected: string,
  path: string,
  issues: ValidationIssue[]
): void {
  if (value !== expected) {
    pushIssue(issues, path, "invalid_literal", `Value must be ${expected}.`);
  }
}

function expectNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(issues, path, "empty_string", "Value must be a non-empty string.");
  }
}

function expectOptionalNonEmptyString(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(issues, path, "empty_string", "Value must be a non-empty string.");
    return undefined;
  }

  return value;
}

function expectOptionalEnum<T extends string>(
  value: unknown,
  guard: (candidate: string) => candidate is T,
  path: string,
  issues: ValidationIssue[]
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !guard(value)) {
    pushIssue(issues, path, "invalid_enum", "Value is not in the allowed set.");
    return undefined;
  }

  return value;
}

function expectUrl(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(issues, path, "invalid_url", "Value must be a non-empty URL string.");
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      pushIssue(issues, path, "invalid_url_protocol", "URL must use https.");
    }
  } catch {
    pushIssue(issues, path, "invalid_url", "Value must be a valid URL.");
  }
}

function expectRepositoryName(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    pushIssue(issues, path, "invalid_repository", "Repository must use owner/name format.");
  }
}

function expectPositiveInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    pushIssue(issues, path, "invalid_integer", "Value must be a positive integer.");
  }
}

function expectIsoDateTime(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    pushIssue(issues, path, "invalid_datetime", "Value must be an ISO-compatible date time.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string
): void {
  issues.push({ path, code, message });
}

function invalid<T>(issues: ValidationIssue[]): ValidationResult<T> {
  return {
    ok: false,
    issues
  };
}
