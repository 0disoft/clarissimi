import type {
  LiveGitHubActor,
  LiveGitHubClient,
  LiveGitHubPullRequest,
  LiveGitHubPullRequestFile,
  LiveGitHubPullRequestLookup,
  LiveGitHubReviewComment,
} from "./live.js";

const DEFAULT_GITHUB_API_URL = "https://api.github.com";
const DEFAULT_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 10;

export interface GitHubApiClientOptions {
  readonly token?: string;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
}

export class GitHubApiClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubApiClientError";
    this.code = code;
  }
}

export function createGitHubApiClient(options: GitHubApiClientOptions = {}): LiveGitHubClient {
  const apiUrl = normalizeApiUrl(options.apiUrl);
  const fetchImpl = options.fetch ?? fetch;

  return {
    async getPullRequest(input: LiveGitHubPullRequestLookup): Promise<LiveGitHubPullRequest> {
      const response = await requestJson(
        fetchImpl,
        options.token,
        `${apiUrl}/repos/${input.repository}/pulls/${input.pullRequestNumber}`,
      );
      return parsePullRequest(response);
    },

    async listPullRequestFiles(
      input: LiveGitHubPullRequestLookup,
    ): Promise<readonly LiveGitHubPullRequestFile[]> {
      const response = await requestPaginatedArray(
        fetchImpl,
        options.token,
        `${apiUrl}/repos/${input.repository}/pulls/${input.pullRequestNumber}/files`,
        "GitHub pull request files response must be an array.",
      );

      return response.map(parsePullRequestFile);
    },

    async listPullRequestReviewComments(
      input: LiveGitHubPullRequestLookup,
    ): Promise<readonly LiveGitHubReviewComment[]> {
      const response = await requestPaginatedArray(
        fetchImpl,
        options.token,
        `${apiUrl}/repos/${input.repository}/pulls/${input.pullRequestNumber}/comments`,
        "GitHub pull request review comments response must be an array.",
      );

      return response.map(parseReviewComment);
    },
  };
}

async function requestPaginatedArray(
  fetchImpl: typeof fetch,
  token: string | undefined,
  baseUrl: string,
  invalidResponseMessage: string,
): Promise<readonly unknown[]> {
  const entries: unknown[] = [];

  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const response = await requestJson(
      fetchImpl,
      token,
      `${baseUrl}?per_page=${DEFAULT_PAGE_SIZE}&page=${page}`,
    );
    if (!Array.isArray(response)) {
      throw new GitHubApiClientError("unexpected_response", invalidResponseMessage);
    }

    entries.push(...response);
    if (response.length < DEFAULT_PAGE_SIZE) {
      return entries;
    }
  }

  throw new GitHubApiClientError(
    "response_too_large",
    `GitHub list response exceeded ${MAX_LIST_PAGES * DEFAULT_PAGE_SIZE} items.`,
  );
}

async function requestJson(
  fetchImpl: typeof fetch,
  token: string | undefined,
  url: string,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const normalizedToken = token?.trim();
  if (normalizedToken !== undefined && normalizedToken.length > 0) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers,
  });
  const text = await response.text();
  const body = parseOptionalJson(text);
  if (response.ok) {
    return body;
  }

  throw mapGitHubApiError(response.status, body);
}

function parsePullRequest(value: unknown): LiveGitHubPullRequest {
  assertRecord(value, "pull request");
  assertRecord(value.user, "pull request user");

  const user: LiveGitHubPullRequest["user"] = {
    id: expectStringOrNumber(value.user.id, "user.id"),
    login: expectString(value.user.login, "user.login"),
  };
  assignOptional(
    user,
    "htmlUrl",
    expectOptionalNullableString(value.user.html_url, "user.html_url"),
  );

  const pullRequest: LiveGitHubPullRequest = {
    number: expectNumber(value.number, "number"),
    title: expectString(value.title, "title"),
    htmlUrl: expectString(value.html_url, "html_url"),
    user,
    labels: parseLabels(value.labels),
  };

  assignOptional(pullRequest, "body", expectOptionalNullableString(value.body, "body"));
  assignOptional(
    pullRequest,
    "mergedAt",
    expectOptionalNullableString(value.merged_at, "merged_at"),
  );
  assignOptional(
    pullRequest,
    "mergeCommitSha",
    expectOptionalNullableString(value.merge_commit_sha, "merge_commit_sha"),
  );

  return pullRequest;
}

function parsePullRequestFile(value: unknown): LiveGitHubPullRequestFile {
  assertRecord(value, "pull request file");

  const file: LiveGitHubPullRequestFile = {
    filename: expectString(value.filename, "filename"),
  };

  assignOptional(file, "status", expectOptionalNullableString(value.status, "status"));
  assignOptional(file, "additions", expectOptionalNullableNumber(value.additions, "additions"));
  assignOptional(file, "deletions", expectOptionalNullableNumber(value.deletions, "deletions"));
  assignOptional(file, "patch", expectOptionalNullableString(value.patch, "patch"));
  return file;
}

function parseReviewComment(value: unknown): LiveGitHubReviewComment {
  assertRecord(value, "review comment");
  const comment: LiveGitHubReviewComment = {
    id: expectStringOrNumber(value.id, "id"),
  };

  assignOptional(comment, "body", expectOptionalNullableString(value.body, "body"));
  assignOptional(comment, "htmlUrl", expectOptionalNullableString(value.html_url, "html_url"));
  assignOptional(comment, "path", expectOptionalNullableString(value.path, "path"));
  assignOptional(comment, "diffHunk", expectOptionalNullableString(value.diff_hunk, "diff_hunk"));

  if (isRecord(value.user)) {
    const user: LiveGitHubActor = {
      id: expectStringOrNumber(value.user.id, "user.id"),
      login: expectString(value.user.login, "user.login"),
    };
    assignOptional(
      user,
      "htmlUrl",
      expectOptionalNullableString(value.user.html_url, "user.html_url"),
    );
    assignOptional(comment, "user", user);
  }

  return comment;
}

function parseLabels(value: unknown): readonly { readonly name: string }[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new GitHubApiClientError("unexpected_response", "Pull request labels must be an array.");
  }

  return value.map((entry) => {
    assertRecord(entry, "label");
    return {
      name: expectString(entry.name, "label.name"),
    };
  });
}

function mapGitHubApiError(status: number, body: unknown): GitHubApiClientError {
  const message = githubMessage(body);
  if (status === 401 || status === 403) {
    return new GitHubApiClientError("permission_denied", message);
  }

  if (status === 404) {
    return new GitHubApiClientError("not_found", message);
  }

  if (status === 429) {
    return new GitHubApiClientError("rate_limited", message);
  }

  return new GitHubApiClientError("request_failed", message);
}

function normalizeApiUrl(value: string | undefined): string {
  const normalized = value?.replace(/\/+$/g, "").trim();
  return normalized === undefined || normalized.length === 0 ? DEFAULT_GITHUB_API_URL : normalized;
}

function parseOptionalJson(text: string): unknown {
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function githubMessage(value: unknown): string {
  if (isRecord(value) && typeof value.message === "string") {
    return value.message;
  }

  return "GitHub API request failed.";
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GitHubApiClientError(
      "unexpected_response",
      `GitHub API response field ${field} must be a non-empty string.`,
    );
  }

  return value;
}

function expectOptionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return expectString(value, field);
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new GitHubApiClientError(
      "unexpected_response",
      `GitHub API response field ${field} must be an integer.`,
    );
  }

  return value;
}

function expectOptionalNullableNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return expectNumber(value, field);
}

function expectStringOrNumber(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new GitHubApiClientError(
      "unexpected_response",
      `GitHub API response field ${field} must be a string or number.`,
    );
  }

  return value;
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new GitHubApiClientError(
      "unexpected_response",
      `GitHub API ${name} response must be an object.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
