import {
  ProposalPullRequestClientError,
  type ProposalPullRequest,
  type ProposalPullRequestClient,
  type ProposalPullRequestCreateInput,
  type ProposalPullRequestLookupInput,
  type ProposalPullRequestUpdateInput,
} from "./pull-request.js";
import type {
  SourcePullRequestComment,
  SourcePullRequestCommentClient,
  SourcePullRequestCommentCreateInput,
  SourcePullRequestCommentListResult,
  SourcePullRequestCommentLookupInput,
  SourcePullRequestCommentUpdateInput,
} from "./source-comment.js";

const DEFAULT_GITHUB_API_URL = "https://api.github.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 60_000;
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENT_PAGES = 10;

export interface GitHubPullRequestClientOptions {
  readonly token: string;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}

export function createGitHubPullRequestClient(
  options: GitHubPullRequestClientOptions,
): ProposalPullRequestClient & SourcePullRequestCommentClient {
  const token = options.token.trim();
  if (token.length === 0) {
    throw new ProposalPullRequestClientError(
      "permission_denied",
      "A GitHub token is required to create or update proposal pull requests.",
    );
  }

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
  const sleep = options.sleep ?? defaultSleep;
  const random = randomOption(options.random ?? Math.random);

  const findOpenPullRequest = async (
    input: ProposalPullRequestLookupInput,
  ): Promise<ProposalPullRequest | null> => {
    const [owner] = splitRepository(input.repository);
    const url = new URL(`${apiUrl}/repos/${input.repository}/pulls`);
    url.searchParams.set("state", "open");
    url.searchParams.set("head", `${owner}:${input.headBranch}`);
    url.searchParams.set("base", input.baseBranch);

    const response = await requestJsonWithRetry(
      fetchImpl,
      token,
      url,
      { method: "GET" },
      { timeoutMs, maxResponseBytes, sleep, random },
    );
    if (!Array.isArray(response)) {
      throw new ProposalPullRequestClientError(
        "unexpected",
        "GitHub pull request lookup returned an unexpected response.",
      );
    }

    const first = response[0];
    return first === undefined ? null : parsePullRequest(first);
  };

  const listPullRequestComments = async (
    input: SourcePullRequestCommentLookupInput,
  ): Promise<SourcePullRequestCommentListResult> => {
    const comments: SourcePullRequestComment[] = [];
    for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
      const url = new URL(
        `${apiUrl}/repos/${input.repository}/issues/${input.pullRequestNumber}/comments`,
      );
      url.searchParams.set("per_page", String(COMMENTS_PER_PAGE));
      url.searchParams.set("page", String(page));
      const response = await requestJsonWithRetry(
        fetchImpl,
        token,
        url,
        { method: "GET" },
        { timeoutMs, maxResponseBytes, sleep, random },
      );
      if (!Array.isArray(response)) {
        throw new ProposalPullRequestClientError(
          "unexpected",
          "GitHub source pull request comment lookup returned an unexpected response.",
        );
      }

      comments.push(...response.map(parseSourcePullRequestComment));
      if (response.length < COMMENTS_PER_PAGE) {
        return { comments, complete: true };
      }
    }

    return { comments, complete: false };
  };

  return {
    findOpenPullRequest,

    async createPullRequest(input: ProposalPullRequestCreateInput): Promise<ProposalPullRequest> {
      const url = new URL(`${apiUrl}/repos/${input.repository}/pulls`);
      const init = {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.headBranch,
          base: input.baseBranch,
        }),
      } satisfies RequestInit;
      let lastError: ProposalPullRequestClientError | undefined;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await requestJsonOnce(
            fetchImpl,
            token,
            url,
            init,
            timeoutMs,
            maxResponseBytes,
          );
          try {
            return parsePullRequest(response);
          } catch (error) {
            const reconciled = await findOpenPullRequest(input);
            if (reconciled !== null) {
              return reconciled;
            }
            throw error;
          }
        } catch (error) {
          if (!(error instanceof ProposalPullRequestClientError)) {
            throw error;
          }

          lastError = error;
          const shouldReconcile = error.retryable || error.status === 422;
          if (!shouldReconcile) {
            throw error;
          }

          let retryDelayUnavailable = false;
          if (error.retryable) {
            const delay = retryDelay(error, attempt, random);
            if (delay !== undefined) {
              await sleep(delay);
            } else {
              retryDelayUnavailable = true;
            }
          }

          const reconciled = await findOpenPullRequest(input);
          if (reconciled !== null) {
            return reconciled;
          }

          if (error.status === 422 || retryDelayUnavailable || attempt === MAX_ATTEMPTS) {
            throw error;
          }
        }
      }

      throw (
        lastError ??
        new ProposalPullRequestClientError(
          "unexpected",
          "GitHub pull request creation failed without a result.",
        )
      );
    },

    async updatePullRequest(input: ProposalPullRequestUpdateInput): Promise<ProposalPullRequest> {
      const url = new URL(`${apiUrl}/repos/${input.repository}/pulls/${input.number}`);
      const response = await requestJsonWithRetry(
        fetchImpl,
        token,
        url,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: input.title,
            body: input.body,
          }),
        },
        { timeoutMs, maxResponseBytes, sleep, random },
      );

      return parsePullRequest(response);
    },

    listPullRequestComments,

    async createPullRequestComment(
      input: SourcePullRequestCommentCreateInput,
    ): Promise<SourcePullRequestComment> {
      const url = new URL(
        `${apiUrl}/repos/${input.repository}/issues/${input.pullRequestNumber}/comments`,
      );
      try {
        const response = await requestJsonOnce(
          fetchImpl,
          token,
          url,
          { method: "POST", body: JSON.stringify({ body: input.body }) },
          timeoutMs,
          maxResponseBytes,
        );
        return parseSourcePullRequestComment(response);
      } catch (error) {
        if (!(error instanceof ProposalPullRequestClientError)) {
          throw error;
        }

        try {
          const listed = await listPullRequestComments(input);
          const reconciled = listed.comments.filter(
            (comment) =>
              comment.body === input.body &&
              comment.authorLogin === "github-actions[bot]" &&
              comment.authorType === "Bot" &&
              comment.appSlug === "github-actions",
          );
          if (listed.complete && reconciled.length === 1) {
            return reconciled[0];
          }
          if (reconciled.length > 1) {
            throw new ProposalPullRequestClientError(
              "unexpected",
              "GitHub source pull request comment creation reconciliation found duplicates.",
            );
          }
        } catch (reconciliationError) {
          if (
            reconciliationError instanceof ProposalPullRequestClientError &&
            reconciliationError.code === "unexpected" &&
            /found duplicates/.test(reconciliationError.message)
          ) {
            throw reconciliationError;
          }
        }

        throw error;
      }
    },

    async updatePullRequestComment(
      input: SourcePullRequestCommentUpdateInput,
    ): Promise<SourcePullRequestComment> {
      const url = new URL(`${apiUrl}/repos/${input.repository}/issues/comments/${input.commentId}`);
      const response = await requestJsonWithRetry(
        fetchImpl,
        token,
        url,
        { method: "PATCH", body: JSON.stringify({ body: input.body }) },
        { timeoutMs, maxResponseBytes, sleep, random },
      );
      return parseSourcePullRequestComment(response);
    },
  };
}

interface RequestRetryRuntime {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}

async function requestJsonWithRetry(
  fetchImpl: typeof fetch,
  token: string,
  url: URL,
  init: RequestInit,
  runtime: RequestRetryRuntime,
): Promise<unknown> {
  let lastError: ProposalPullRequestClientError | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestJsonOnce(
        fetchImpl,
        token,
        url,
        init,
        runtime.timeoutMs,
        runtime.maxResponseBytes,
      );
    } catch (error) {
      if (!(error instanceof ProposalPullRequestClientError) || !error.retryable) {
        throw error;
      }

      lastError = error;
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }

      const delay = retryDelay(error, attempt, runtime.random);
      if (delay === undefined) {
        throw error;
      }
      await runtime.sleep(delay);
    }
  }

  throw (
    lastError ??
    new ProposalPullRequestClientError(
      "unexpected",
      "GitHub pull request request failed without a result.",
    )
  );
}

async function requestJsonOnce(
  fetchImpl: typeof fetch,
  token: string,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<unknown> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal,
      });

      const text = await readBoundedResponseText(response, maxResponseBytes);
      const body = parseOptionalJson(text);
      if (response.ok) {
        return body;
      }

      throw mapGitHubError(response, body);
    });
  } catch (error) {
    if (error instanceof ProposalPullRequestClientError) {
      throw error;
    }
    if (error instanceof RequestTimeoutError) {
      throw new ProposalPullRequestClientError(
        "timeout",
        "GitHub pull request request timed out.",
        { retryable: true },
      );
    }
    throw new ProposalPullRequestClientError(
      "network_error",
      "GitHub pull request request failed before a response.",
      { retryable: true },
    );
  }
}

function mapGitHubError(response: Response, body: unknown): ProposalPullRequestClientError {
  const status = response.status;
  const message = githubMessage(body);
  const retryAfterMs = parseRetryAfterMs(response);
  const rateLimited =
    status === 429 ||
    (status === 403 &&
      (retryAfterMs !== undefined || response.headers?.get?.("x-ratelimit-remaining") === "0"));
  if (rateLimited) {
    return new ProposalPullRequestClientError("rate_limited", message, {
      retryable: true,
      status,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }

  if (status === 401 || status === 403) {
    if (/workflow|actions.*pull request|pull request.*disabled|repository setting/i.test(message)) {
      return new ProposalPullRequestClientError("repository_setting_blocked", message, { status });
    }

    return new ProposalPullRequestClientError("permission_denied", message, { status });
  }

  if (status === 404) {
    return new ProposalPullRequestClientError("not_found", message, { status });
  }

  if (status >= 500) {
    return new ProposalPullRequestClientError("server_error", message, {
      retryable: true,
      status,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }

  return new ProposalPullRequestClientError("request_failed", message, { status });
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw responseTooLargeError(maxBytes);
    }
  }

  if (response.body === null || response.body === undefined) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw responseTooLargeError(maxBytes);
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
        throw responseTooLargeError(maxBytes);
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

function responseTooLargeError(maxBytes: number): ProposalPullRequestClientError {
  return new ProposalPullRequestClientError(
    "response_too_large",
    `GitHub pull request response exceeded ${maxBytes} bytes.`,
  );
}

function retryDelay(
  error: ProposalPullRequestClientError,
  failedAttempt: number,
  random: () => number,
): number | undefined {
  if (error.retryAfterMs !== undefined) {
    return error.retryAfterMs <= MAX_RETRY_DELAY_MS ? error.retryAfterMs : undefined;
  }

  const exponential = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, failedAttempt - 1);
  const jittered = Math.floor(exponential * (0.75 + random() * 0.5));
  return Math.min(jittered, MAX_RETRY_DELAY_MS);
}

function parseRetryAfterMs(response: Response): number | undefined {
  const value = response.headers?.get?.("retry-after")?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  if (/^[0-9]+$/.test(value)) {
    return Number(value) * 1_000;
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function parsePullRequest(value: unknown): ProposalPullRequest {
  if (!isRecord(value)) {
    throw new ProposalPullRequestClientError(
      "unexpected",
      "GitHub pull request response must be an object.",
    );
  }

  const head = value.head;
  const base = value.base;
  if (!isRecord(head) || !isRecord(base)) {
    throw new ProposalPullRequestClientError(
      "unexpected",
      "GitHub pull request response must include head and base refs.",
    );
  }

  return {
    number: expectNumber(value.number, "number"),
    url: expectString(value.html_url, "html_url"),
    headBranch: expectString(head.ref, "head.ref"),
    baseBranch: expectString(base.ref, "base.ref"),
    title: expectString(value.title, "title"),
  };
}

function parseSourcePullRequestComment(value: unknown): SourcePullRequestComment {
  if (!isRecord(value) || !isRecord(value.user)) {
    throw new ProposalPullRequestClientError(
      "unexpected",
      "GitHub source pull request comment response must include an author.",
    );
  }

  const app = value.performed_via_github_app;
  const comment: SourcePullRequestComment = {
    id: expectNumber(value.id, "id"),
    url: expectString(value.html_url, "html_url"),
    body: typeof value.body === "string" ? value.body : "",
    authorLogin: expectString(value.user.login, "user.login"),
    authorType: expectString(value.user.type, "user.type"),
  };
  if (isRecord(app) && typeof app.slug === "string" && app.slug.trim().length > 0) {
    return { ...comment, appSlug: app.slug };
  }

  return comment;
}

function normalizeApiUrl(value: string | undefined): string {
  const normalized = value?.replace(/\/+$/g, "").trim();
  return normalized === undefined || normalized.length === 0 ? DEFAULT_GITHUB_API_URL : normalized;
}

function splitRepository(repository: string): readonly [string, string] {
  const parts = repository.split("/");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    throw new ProposalPullRequestClientError(
      "unexpected",
      "Repository must use owner/name format for GitHub pull request operations.",
    );
  }

  return [parts[0], parts[1]];
}

function parseOptionalJson(text: string): unknown {
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function githubMessage(value: unknown): string {
  if (isRecord(value) && typeof value.message === "string") {
    const normalized = value.message.replace(/\s+/g, " ").trim();
    if (normalized.length > 0) {
      return normalized.length <= 500 ? normalized : `${normalized.slice(0, 497)}...`;
    }
  }

  return "GitHub pull request request failed.";
}

function positiveIntegerOption(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ProposalPullRequestClientError(
      "invalid_options",
      `GitHub pull request client ${name} must be a positive integer.`,
    );
  }
  return value;
}

function randomOption(value: () => number): () => number {
  return () => {
    const sample = value();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new ProposalPullRequestClientError(
        "invalid_options",
        "GitHub pull request client random must return a number from 0 inclusive to 1 exclusive.",
      );
    }
    return sample;
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProposalPullRequestClientError(
      "unexpected",
      `GitHub pull request response field ${field} must be a non-empty string.`,
    );
  }

  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProposalPullRequestClientError(
      "unexpected",
      `GitHub pull request response field ${field} must be a positive integer.`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
