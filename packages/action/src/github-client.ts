import {
  ProposalPullRequestClientError,
  type ProposalPullRequest,
  type ProposalPullRequestClient,
  type ProposalPullRequestCreateInput,
  type ProposalPullRequestLookupInput,
  type ProposalPullRequestUpdateInput,
} from "./pull-request.js";

const DEFAULT_GITHUB_API_URL = "https://api.github.com";

export interface GitHubPullRequestClientOptions {
  readonly token: string;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
}

export function createGitHubPullRequestClient(
  options: GitHubPullRequestClientOptions,
): ProposalPullRequestClient {
  const token = options.token.trim();
  if (token.length === 0) {
    throw new ProposalPullRequestClientError(
      "permission_denied",
      "A GitHub token is required to create or update proposal pull requests.",
    );
  }

  const apiUrl = normalizeApiUrl(options.apiUrl);
  const fetchImpl = options.fetch ?? fetch;

  return {
    async findOpenPullRequest(
      input: ProposalPullRequestLookupInput,
    ): Promise<ProposalPullRequest | null> {
      const [owner] = splitRepository(input.repository);
      const url = new URL(`${apiUrl}/repos/${input.repository}/pulls`);
      url.searchParams.set("state", "open");
      url.searchParams.set("head", `${owner}:${input.headBranch}`);
      url.searchParams.set("base", input.baseBranch);

      const response = await requestJson(fetchImpl, token, url, {
        method: "GET",
      });
      if (!Array.isArray(response)) {
        throw new ProposalPullRequestClientError(
          "unexpected",
          "GitHub pull request lookup returned an unexpected response.",
        );
      }

      const first = response[0];
      return first === undefined ? null : parsePullRequest(first);
    },

    async createPullRequest(input: ProposalPullRequestCreateInput): Promise<ProposalPullRequest> {
      const url = new URL(`${apiUrl}/repos/${input.repository}/pulls`);
      const response = await requestJson(fetchImpl, token, url, {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.headBranch,
          base: input.baseBranch,
        }),
      });

      return parsePullRequest(response);
    },

    async updatePullRequest(input: ProposalPullRequestUpdateInput): Promise<ProposalPullRequest> {
      const url = new URL(`${apiUrl}/repos/${input.repository}/pulls/${input.number}`);
      const response = await requestJson(fetchImpl, token, url, {
        method: "PATCH",
        body: JSON.stringify({
          title: input.title,
          body: input.body,
        }),
      });

      return parsePullRequest(response);
    },
  };
}

async function requestJson(
  fetchImpl: typeof fetch,
  token: string,
  url: URL,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const text = await response.text();
  const body = parseOptionalJson(text);
  if (response.ok) {
    return body;
  }

  throw mapGitHubError(response.status, body);
}

function mapGitHubError(status: number, body: unknown): ProposalPullRequestClientError {
  const message = githubMessage(body);
  if (status === 401 || status === 403) {
    if (/workflow|actions.*pull request|pull request.*disabled|repository setting/i.test(message)) {
      return new ProposalPullRequestClientError("repository_setting_blocked", message);
    }

    return new ProposalPullRequestClientError("permission_denied", message);
  }

  if (status === 404) {
    return new ProposalPullRequestClientError("not_found", message);
  }

  return new ProposalPullRequestClientError("unexpected", message);
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
    return {
      message: text,
    };
  }
}

function githubMessage(value: unknown): string {
  if (isRecord(value) && typeof value.message === "string") {
    return value.message;
  }

  return "GitHub pull request request failed.";
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
