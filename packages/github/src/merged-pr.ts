import type { EvidenceItemInput } from "@clarissimi/core";
import type { ContributorIdentity, RecognitionSource } from "@clarissimi/schemas";

import type {
  CollectedGitHubEvidence,
  GitHubActorFixture,
  GitHubChangedFileFixture,
  GitHubLabelFixture,
  GitHubMergedPullRequestFixture,
} from "./types.js";

const DEFAULT_TEXT_LIMIT = 2_000;
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TEST_PATH_PATTERN = /(^|\/)(__tests__|tests?|specs?)(\/|$)|[./_-](test|spec)\.[cm]?[jt]sx?$/i;

export class GitHubEvidenceCollectionError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "GitHubEvidenceCollectionError";
    this.field = field;
  }
}

export function parseGitHubMergedPullRequestFixture(
  value: unknown,
): GitHubMergedPullRequestFixture {
  assertRecord(value, "$");
  assertRecord(value.repository, "$.repository");
  assertRecord(value.pullRequest, "$.pullRequest");

  const pullRequest = value.pullRequest;
  assertRecord(pullRequest.user, "$.pullRequest.user");

  const fixture: GitHubMergedPullRequestFixture = {
    repository: {
      fullName: expectString(value.repository.fullName, "$.repository.fullName"),
    },
    pullRequest: {
      number: expectNumber(pullRequest.number, "$.pullRequest.number"),
      title: expectString(pullRequest.title, "$.pullRequest.title"),
      user: {
        id: expectStringOrNumber(pullRequest.user.id, "$.pullRequest.user.id"),
        login: expectString(pullRequest.user.login, "$.pullRequest.user.login"),
      },
    },
  };

  assignOptional(
    fixture.pullRequest,
    "body",
    expectOptionalString(pullRequest.body, "$.pullRequest.body"),
  );
  assignOptional(
    fixture.pullRequest,
    "htmlUrl",
    expectOptionalString(pullRequest.htmlUrl, "$.pullRequest.htmlUrl"),
  );
  assignOptional(
    fixture.pullRequest,
    "mergedAt",
    expectOptionalString(pullRequest.mergedAt, "$.pullRequest.mergedAt"),
  );
  assignOptional(
    fixture.pullRequest.user,
    "htmlUrl",
    expectOptionalString(pullRequest.user.htmlUrl, "$.pullRequest.user.htmlUrl"),
  );
  assignOptional(
    fixture.pullRequest.user,
    "kind",
    expectOptionalContributorKind(pullRequest.user.kind, "$.pullRequest.user.kind"),
  );
  assignOptional(
    fixture.pullRequest,
    "labels",
    parseOptionalLabels(pullRequest.labels, "$.pullRequest.labels"),
  );
  assignOptional(
    fixture.pullRequest,
    "changedFiles",
    parseOptionalChangedFiles(pullRequest.changedFiles, "$.pullRequest.changedFiles"),
  );
  assignOptional(
    fixture.pullRequest,
    "mergeCommitSha",
    expectOptionalString(pullRequest.mergeCommitSha, "$.pullRequest.mergeCommitSha"),
  );

  return fixture;
}

export function collectMergedPullRequestEvidence(
  fixture: GitHubMergedPullRequestFixture,
): CollectedGitHubEvidence {
  const repository = normalizeRequiredString(fixture.repository.fullName, "repository.fullName");
  if (!REPOSITORY_NAME_PATTERN.test(repository)) {
    throw new GitHubEvidenceCollectionError(
      "repository.fullName",
      "Repository full name must use owner/name format.",
    );
  }

  const pullRequest = fixture.pullRequest;
  const pullRequestNumber = normalizePositiveInteger(pullRequest.number, "pullRequest.number");
  const title = normalizeRequiredString(pullRequest.title, "pullRequest.title");
  const mergedAt = normalizeOptionalDateTime(pullRequest.mergedAt, "pullRequest.mergedAt");
  const pullRequestUrl = normalizeOptionalHttpsUrl(pullRequest.htmlUrl, "pullRequest.htmlUrl");
  const contributor = collectContributor(pullRequest.user);
  const source: RecognitionSource = {
    repository,
    event: "merged_pull_request",
    pullRequestNumber,
  };
  assignOptional(source, "mergedAt", mergedAt);

  const items = [
    buildPullRequestItem(pullRequestNumber, title, pullRequest.body, pullRequestUrl),
    ...buildLabelItems(pullRequest.labels ?? []),
    ...buildChangedFileItems(pullRequest.changedFiles ?? []),
    ...buildMergeCommitItems(pullRequest.mergeCommitSha),
  ];

  return {
    contributor,
    evidence: {
      source,
      items: dedupeEvidenceItems(items),
    },
  };
}

function collectContributor(user: GitHubActorFixture): ContributorIdentity {
  const id = normalizeRequiredString(String(user.id), "pullRequest.user.id");
  const login = normalizeRequiredString(user.login, "pullRequest.user.login");
  const profileUrl =
    normalizeOptionalHttpsUrl(user.htmlUrl, "pullRequest.user.htmlUrl") ??
    `https://github.com/${encodeURIComponent(login)}`;

  const contributor: ContributorIdentity = {
    platform: "github",
    id,
    login,
    profileUrl,
  };
  assignOptional(contributor, "kind", user.kind);
  return contributor;
}

function expectOptionalContributorKind(value: unknown, path: string): GitHubActorFixture["kind"] {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "human" && value !== "bot" && value !== "ai_agent") {
    throw new GitHubEvidenceCollectionError(path, `${path} must be human, bot, or ai_agent.`);
  }

  return value;
}

function buildPullRequestItem(
  pullRequestNumber: number,
  title: string,
  body: string | undefined,
  url: string | undefined,
): EvidenceItemInput {
  const item: EvidenceItemInput = {
    kind: "pull_request",
    id: `PR-${pullRequestNumber}`,
    title,
  };
  assignOptional(item, "url", url);
  assignOptional(item, "excerpt", normalizeOptionalExcerpt(body));
  return item;
}

function buildLabelItems(labels: readonly GitHubLabelFixture[]): EvidenceItemInput[] {
  return labels.flatMap((label, index) => {
    const name = normalizeOptionalString(label.name);
    if (name === undefined) {
      return [];
    }

    return [
      {
        kind: "label",
        id: `label:${name.toLowerCase()}`,
        title: name,
        metadata: {
          sourceIndex: index,
        },
      },
    ];
  });
}

function buildChangedFileItems(files: readonly GitHubChangedFileFixture[]): EvidenceItemInput[] {
  return files.map((file) => {
    const filename = normalizeRequiredString(file.filename, "pullRequest.changedFiles[].filename");
    const status = normalizeOptionalString(file.status);
    const additions = normalizeOptionalNonNegativeInteger(file.additions, "additions");
    const deletions = normalizeOptionalNonNegativeInteger(file.deletions, "deletions");
    const metadata = buildFileMetadata(status, additions, deletions);
    const item: EvidenceItemInput = {
      kind: isTestPath(filename) ? "test" : "file",
      id: filename,
      title: filename,
    };

    assignOptional(item, "excerpt", buildFileExcerpt(file, status, additions, deletions));
    assignOptional(item, "metadata", metadata);
    return item;
  });
}

function buildMergeCommitItems(mergeCommitSha: string | undefined): EvidenceItemInput[] {
  const normalized = normalizeOptionalString(mergeCommitSha);
  if (normalized === undefined) {
    return [];
  }

  return [
    {
      kind: "commit",
      id: normalized,
      title: `Merge commit ${normalized.slice(0, 12)}`,
    },
  ];
}

function buildFileExcerpt(
  file: GitHubChangedFileFixture,
  status: string | undefined,
  additions: number | undefined,
  deletions: number | undefined,
): string | undefined {
  const patchExcerpt = normalizeOptionalExcerpt(file.patchExcerpt);
  if (patchExcerpt !== undefined) {
    return patchExcerpt;
  }

  const changeSummary = [
    status ?? "changed",
    additions === undefined ? undefined : `${additions} additions`,
    deletions === undefined ? undefined : `${deletions} deletions`,
  ].filter((entry): entry is string => entry !== undefined);

  return changeSummary.length === 0 ? undefined : changeSummary.join(", ");
}

function buildFileMetadata(
  status: string | undefined,
  additions: number | undefined,
  deletions: number | undefined,
): EvidenceItemInput["metadata"] | undefined {
  const metadata: Record<string, string | number> = {};
  assignOptional(metadata, "status", status);
  assignOptional(metadata, "additions", additions);
  assignOptional(metadata, "deletions", deletions);

  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function dedupeEvidenceItems(items: readonly EvidenceItemInput[]): EvidenceItemInput[] {
  const seen = new Set<string>();
  const deduped: EvidenceItemInput[] = [];

  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function normalizeRequiredString(value: string, field: string): string {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be a non-empty string.`);
  }

  return normalized;
}

function parseOptionalLabels(
  value: unknown,
  field: string,
): readonly GitHubLabelFixture[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be an array when provided.`);
  }

  return value.map((entry, index) => {
    assertRecord(entry, `${field}[${index}]`);
    return {
      name: expectString(entry.name, `${field}[${index}].name`),
    };
  });
}

function parseOptionalChangedFiles(
  value: unknown,
  field: string,
): readonly GitHubChangedFileFixture[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be an array when provided.`);
  }

  return value.map((entry, index) => {
    const itemPath = `${field}[${index}]`;
    assertRecord(entry, itemPath);

    const changedFile: GitHubChangedFileFixture = {
      filename: expectString(entry.filename, `${itemPath}.filename`),
    };
    assignOptional(changedFile, "status", expectOptionalString(entry.status, `${itemPath}.status`));
    assignOptional(
      changedFile,
      "additions",
      expectOptionalNumber(entry.additions, `${itemPath}.additions`),
    );
    assignOptional(
      changedFile,
      "deletions",
      expectOptionalNumber(entry.deletions, `${itemPath}.deletions`),
    );
    assignOptional(
      changedFile,
      "patchExcerpt",
      expectOptionalString(entry.patchExcerpt, `${itemPath}.patchExcerpt`),
    );

    return changedFile;
  });
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new GitHubEvidenceCollectionError(field, `${field} must be a string.`);
  }

  return value;
}

function expectOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, field);
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new GitHubEvidenceCollectionError(field, `${field} must be a number.`);
  }

  return value;
}

function expectOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectNumber(value, field);
}

function expectStringOrNumber(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new GitHubEvidenceCollectionError(field, `${field} must be a string or number.`);
  }

  return value;
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be an object.`);
  }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeOptionalExcerpt(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return undefined;
  }

  return normalized.length > DEFAULT_TEXT_LIMIT
    ? `${normalized.slice(0, DEFAULT_TEXT_LIMIT - 1)}...`
    : normalized;
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be a positive integer.`);
  }

  return value;
}

function normalizeOptionalNonNegativeInteger(
  value: number | undefined,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new GitHubEvidenceCollectionError(
      `pullRequest.changedFiles[].${field}`,
      `${field} must be a non-negative integer when provided.`,
    );
  }

  return value;
}

function normalizeOptionalDateTime(value: string | undefined, field: string): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return undefined;
  }

  if (Number.isNaN(Date.parse(normalized))) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be an ISO-compatible date time.`);
  }

  return normalized;
}

function normalizeOptionalHttpsUrl(value: string | undefined, field: string): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") {
      throw new GitHubEvidenceCollectionError(field, `${field} must use https.`);
    }
  } catch (error) {
    if (error instanceof GitHubEvidenceCollectionError) {
      throw error;
    }

    throw new GitHubEvidenceCollectionError(field, `${field} must be a valid URL.`);
  }

  return normalized;
}

function isTestPath(filename: string): boolean {
  return TEST_PATH_PATTERN.test(filename.replace(/\\/g, "/"));
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
