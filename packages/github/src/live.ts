import type { EvidenceItemInput } from "@clarissimi/core";

import { collectMergedPullRequestEvidence, GitHubEvidenceCollectionError } from "./merged-pr.js";
import type {
  CollectedGitHubEvidence,
  GitHubChangedFileFixture,
  GitHubMergedPullRequestFixture,
} from "./types.js";

const DEFAULT_REVIEW_COMMENT_LIMIT = 25;
const DEFAULT_LINKED_ISSUE_LIMIT = 25;
const DEFAULT_CHANGED_FILE_LIMIT = 100;
const TEXT_LIMIT = 2_000;
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface LiveGitHubMergedPullRequestInput {
  readonly client: LiveGitHubClient;
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly reviewCommentLimit?: number;
  readonly linkedIssueLimit?: number;
}

export interface LiveGitHubClient {
  getPullRequest(input: LiveGitHubPullRequestLookup): Promise<LiveGitHubPullRequest>;
  listPullRequestFiles(
    input: LiveGitHubPullRequestLookup,
    limit?: number,
  ): Promise<readonly LiveGitHubPullRequestFile[]>;
  listPullRequestReviewComments(
    input: LiveGitHubPullRequestLookup,
  ): Promise<readonly LiveGitHubReviewComment[]>;
}

export interface LiveGitHubPullRequestLookup {
  readonly repository: string;
  readonly pullRequestNumber: number;
}

export interface LiveGitHubPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null;
  readonly htmlUrl: string;
  readonly mergedAt?: string | null;
  readonly mergeCommitSha?: string | null;
  readonly user: LiveGitHubActor;
  readonly labels?: readonly LiveGitHubLabel[];
}

export interface LiveGitHubActor {
  readonly id: number | string;
  readonly login: string;
  readonly htmlUrl?: string | null;
  readonly kind?: "human" | "bot";
}

export interface LiveGitHubLabel {
  readonly name: string;
}

export interface LiveGitHubPullRequestFile {
  readonly filename: string;
  readonly status?: string | null;
  readonly additions?: number | null;
  readonly deletions?: number | null;
  readonly patch?: string | null;
}

export interface LiveGitHubReviewComment {
  readonly id: number | string;
  readonly body?: string | null;
  readonly htmlUrl?: string | null;
  readonly path?: string | null;
  readonly diffHunk?: string | null;
  readonly user?: LiveGitHubActor | null;
}

export class LiveGitHubCollectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LiveGitHubCollectionError";
    this.code = code;
  }
}

export async function collectLiveMergedPullRequestEvidence(
  input: LiveGitHubMergedPullRequestInput,
): Promise<CollectedGitHubEvidence> {
  validateLiveInput(input);

  const lookup = {
    repository: input.repository,
    pullRequestNumber: input.pullRequestNumber,
  };
  const [pullRequest, files, reviewComments] = await Promise.all([
    input.client.getPullRequest(lookup),
    input.client.listPullRequestFiles(lookup, DEFAULT_CHANGED_FILE_LIMIT),
    input.client.listPullRequestReviewComments(lookup),
  ]);

  if (pullRequest.number !== input.pullRequestNumber) {
    throw new LiveGitHubCollectionError(
      "pull_request_number_mismatch",
      "Live GitHub collector received a pull request for a different number.",
    );
  }

  if (normalizeOptionalString(pullRequest.mergedAt) === undefined) {
    throw new LiveGitHubCollectionError(
      "pull_request_not_merged",
      "Live GitHub collector requires a merged pull request.",
    );
  }

  if (files.length > DEFAULT_CHANGED_FILE_LIMIT) {
    throw new LiveGitHubCollectionError(
      "changed_file_limit",
      `Live GitHub collector changed files must not exceed ${DEFAULT_CHANGED_FILE_LIMIT} items.`,
    );
  }

  const fixture = toMergedPullRequestFixture(input.repository, pullRequest, files);
  const collected = collectMergedPullRequestEvidence(fixture);
  const extraItems = [
    ...buildLinkedIssueItems(pullRequest, input.linkedIssueLimit ?? DEFAULT_LINKED_ISSUE_LIMIT),
    ...buildReviewCommentItems(
      reviewComments,
      input.reviewCommentLimit ?? DEFAULT_REVIEW_COMMENT_LIMIT,
    ),
  ];

  return {
    contributor: collected.contributor,
    evidence: {
      source: collected.evidence.source,
      items: dedupeEvidenceItems([...collected.evidence.items, ...extraItems]),
    },
  };
}

function toMergedPullRequestFixture(
  repository: string,
  pullRequest: LiveGitHubPullRequest,
  files: readonly LiveGitHubPullRequestFile[],
): GitHubMergedPullRequestFixture {
  const fixture: GitHubMergedPullRequestFixture = {
    repository: {
      fullName: repository,
    },
    pullRequest: {
      number: pullRequest.number,
      title: pullRequest.title,
      htmlUrl: pullRequest.htmlUrl,
      mergedAt: normalizeRequiredString(pullRequest.mergedAt, "pullRequest.mergedAt"),
      user: {
        id: pullRequest.user.id,
        login: pullRequest.user.login,
      },
      labels: (pullRequest.labels ?? []).map((label) => ({ name: label.name })),
      changedFiles: files.map(toChangedFileFixture),
    },
  };

  assignOptional(fixture.pullRequest, "body", normalizeOptionalString(pullRequest.body));
  assignOptional(
    fixture.pullRequest.user,
    "htmlUrl",
    normalizeOptionalString(pullRequest.user.htmlUrl),
  );
  assignOptional(fixture.pullRequest.user, "kind", pullRequest.user.kind);
  assignOptional(
    fixture.pullRequest,
    "mergeCommitSha",
    normalizeOptionalString(pullRequest.mergeCommitSha),
  );

  return fixture;
}

function toChangedFileFixture(file: LiveGitHubPullRequestFile): GitHubChangedFileFixture {
  const changedFile: GitHubChangedFileFixture = {
    filename: file.filename,
  };

  assignOptional(changedFile, "status", normalizeOptionalString(file.status));
  assignOptional(changedFile, "additions", normalizeOptionalNonNegativeInteger(file.additions));
  assignOptional(changedFile, "deletions", normalizeOptionalNonNegativeInteger(file.deletions));
  assignOptional(changedFile, "patchExcerpt", normalizeOptionalExcerpt(file.patch));
  return changedFile;
}

function buildLinkedIssueItems(
  pullRequest: LiveGitHubPullRequest,
  limit: number,
): EvidenceItemInput[] {
  const references = collectLinkedIssueRefs(
    `${pullRequest.title}\n${pullRequest.body ?? ""}`,
    limit,
  );

  return references.map((reference) => ({
    kind: "issue",
    id: reference,
    title: `Linked issue candidate ${reference}`,
  }));
}

function collectLinkedIssueRefs(value: string, limit: number): readonly string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  const pattern = /(?:^|[\s([:{])(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#([1-9][0-9]{0,8})\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null && refs.length < limit) {
    const ref = `#${match[1]}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }

  return refs;
}

function buildReviewCommentItems(
  comments: readonly LiveGitHubReviewComment[],
  limit: number,
): EvidenceItemInput[] {
  return comments.slice(0, limit).map((comment) => {
    const id = `review-comment:${String(comment.id)}`;
    const path = normalizeOptionalString(comment.path);
    const title = path === undefined ? `Review comment ${comment.id}` : `Review comment on ${path}`;
    const item: EvidenceItemInput = {
      kind: "review",
      id,
      title,
    };

    assignOptional(
      item,
      "url",
      normalizeOptionalHttpsUrl(comment.htmlUrl, "reviewComment.htmlUrl"),
    );
    assignOptional(item, "excerpt", normalizeOptionalExcerpt(comment.body));
    return item;
  });
}

function validateLiveInput(input: LiveGitHubMergedPullRequestInput): void {
  if (!REPOSITORY_NAME_PATTERN.test(input.repository)) {
    throw new LiveGitHubCollectionError(
      "invalid_repository",
      "Live GitHub collector repository must use owner/name format.",
    );
  }

  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
    throw new LiveGitHubCollectionError(
      "invalid_pull_request_number",
      "Live GitHub collector pull request number must be a positive integer.",
    );
  }

  validateLimit(input.reviewCommentLimit, "review_comment_limit");
  validateLimit(input.linkedIssueLimit, "linked_issue_limit");
}

function validateLimit(value: number | undefined, code: string): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new LiveGitHubCollectionError(
      code,
      "Live GitHub collector limits must be integers between 0 and 100.",
    );
  }
}

function normalizeRequiredString(value: string | null | undefined, field: string): string {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    throw new GitHubEvidenceCollectionError(field, `${field} must be a non-empty string.`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeOptionalExcerpt(value: string | null | undefined): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return undefined;
  }

  return normalized.length > TEXT_LIMIT ? `${normalized.slice(0, TEXT_LIMIT - 1)}...` : normalized;
}

function normalizeOptionalHttpsUrl(
  value: string | null | undefined,
  field: string,
): string | undefined {
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

function normalizeOptionalNonNegativeInteger(value: number | null | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new GitHubEvidenceCollectionError(
      "pullRequest.changedFiles[]",
      "Changed file additions and deletions must be non-negative integers when provided.",
    );
  }

  return value;
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

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
