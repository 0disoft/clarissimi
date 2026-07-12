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
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type GitHubApiClientErrorCode =
  | "invalid_options"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "request_failed"
  | "network_error"
  | "timeout"
  | "response_too_large"
  | "unexpected_response";

export interface GitHubApiClientOptions {
  readonly token?: string;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export class GitHubApiClientError extends Error {
  readonly code: GitHubApiClientErrorCode;
  readonly retryable: boolean;

  constructor(code: GitHubApiClientErrorCode, message: string) {
    super(message);
    this.name = "GitHubApiClientError";
    this.code = code;
    this.retryable = isRetryableCode(code);
  }
}

export function createGitHubApiClient(options: GitHubApiClientOptions = {}): LiveGitHubClient {
  const apiUrl = normalizeApiUrl(options.apiUrl);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = positiveIntegerOption(
    options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    "timeoutMs",
  );
  const maxResponseBytes = positiveIntegerOption(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    "maxResponseBytes",
  );

  return {
    async getPullRequest(input: LiveGitHubPullRequestLookup): Promise<LiveGitHubPullRequest> {
      const response = await requestJson(
        fetchImpl,
        options.token,
        `${apiUrl}/repos/${input.repository}/pulls/${input.pullRequestNumber}`,
        timeoutMs,
        maxResponseBytes,
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
        timeoutMs,
        maxResponseBytes,
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
        timeoutMs,
        maxResponseBytes,
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
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<readonly unknown[]> {
  const entries: unknown[] = [];

  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const response = await requestJson(
      fetchImpl,
      token,
      `${baseUrl}?per_page=${DEFAULT_PAGE_SIZE}&page=${page}`,
      timeoutMs,
      maxResponseBytes,
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
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const normalizedToken = token?.trim();
  if (normalizedToken !== undefined && normalizedToken.length > 0) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }

  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(url, {
        method: "GET",
        headers,
        signal,
      });
      const text = await readBoundedResponseText(response, maxResponseBytes);
      const body = parseOptionalJson(text);
      if (response.ok) {
        return body;
      }

      throw mapGitHubApiError(response.status, body);
    });
  } catch (error) {
    if (error instanceof GitHubApiClientError) {
      throw error;
    }
    if (error instanceof RequestTimeoutError) {
      throw new GitHubApiClientError("timeout", "GitHub API request timed out.");
    }
    throw new GitHubApiClientError("network_error", "GitHub API request failed before a response.");
  }
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

  if (status >= 500) {
    return new GitHubApiClientError("server_error", message);
  }

  return new GitHubApiClientError("request_failed", message);
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new GitHubApiClientError(
        "response_too_large",
        `GitHub API response exceeded ${maxBytes} bytes.`,
      );
    }
  }

  if (response.body === null || response.body === undefined) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new GitHubApiClientError(
        "response_too_large",
        `GitHub API response exceeded ${maxBytes} bytes.`,
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return text + decoder.decode();
      }
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new GitHubApiClientError(
          "response_too_large",
          `GitHub API response exceeded ${maxBytes} bytes.`,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function withTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

class RequestTimeoutError extends Error {}

function positiveIntegerOption(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new GitHubApiClientError(
      "invalid_options",
      `GitHub API client ${name} must be a positive integer.`,
    );
  }
  return value;
}

function isRetryableCode(code: GitHubApiClientErrorCode): boolean {
  return ["rate_limited", "server_error", "network_error", "timeout"].includes(code);
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
