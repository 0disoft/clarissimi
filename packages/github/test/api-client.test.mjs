import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiClientError, createGitHubApiClient } from "../dist/index.js";

test("GitHub API client fetches merged pull request evidence surfaces", async () => {
  const requests = [];
  const client = createGitHubApiClient({
    token: "test-token",
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        method: init.method,
        authorization: init.headers.Authorization,
      });

      if (String(url).endsWith("/pulls/42")) {
        return jsonResponse({
          number: 42,
          title: "Add parser regression coverage",
          body: "Fixes #7",
          html_url: "https://github.com/sample/project/pull/42",
          merged_at: "2026-07-08T00:00:00.000Z",
          merge_commit_sha: "abc123def4567890",
          user: {
            id: 123456,
            login: "dependabot[bot]",
            html_url: "https://github.com/apps/dependabot",
            type: "Bot",
          },
          labels: [
            {
              name: "tests",
            },
          ],
        });
      }

      if (String(url).includes("/files?")) {
        return jsonResponse([
          {
            filename: "tests/parser.spec.ts",
            status: "added",
            additions: 32,
            deletions: 0,
            patch: 'test("parses nested input", () => {})',
          },
        ]);
      }

      return jsonResponse([
        {
          id: 9001,
          body: "Looks covered.",
          html_url: "https://github.com/sample/project/pull/42#discussion_r9001",
          path: "tests/parser.spec.ts",
          diff_hunk: "@@ -0,0 +1,12 @@",
          user: {
            id: 2,
            login: "maintainer",
            html_url: "https://github.com/maintainer",
          },
        },
      ]);
    },
  });

  const lookup = {
    repository: "sample/project",
    pullRequestNumber: 42,
  };
  const pullRequest = await client.getPullRequest(lookup);
  const files = await client.listPullRequestFiles(lookup);
  const comments = await client.listPullRequestReviewComments(lookup);

  assert.equal(pullRequest.user.login, "dependabot[bot]");
  assert.equal(pullRequest.user.kind, "bot");
  assert.equal(files[0].filename, "tests/parser.spec.ts");
  assert.equal(comments[0].path, "tests/parser.spec.ts");
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "https://api.github.com/repos/sample/project/pulls/42",
      "https://api.github.com/repos/sample/project/pulls/42/files?per_page=100&page=1",
      "https://api.github.com/repos/sample/project/pulls/42/comments?per_page=100&page=1",
    ],
  );
  assert.equal(
    requests.every((request) => request.method === "GET"),
    true,
  );
  assert.equal(
    requests.every((request) => request.authorization === "Bearer test-token"),
    true,
  );
});

test("GitHub API client paginates pull request files and review comments", async () => {
  const requests = [];
  const page = (prefix, count) =>
    Array.from({ length: count }, (_, index) => ({
      filename: `${prefix}-${index}.ts`,
      id: `${prefix}-${index}`,
    }));
  const client = createGitHubApiClient({
    fetch: async (url) => {
      const value = String(url);
      requests.push(value);
      const isFirstPage = value.endsWith("page=1");
      if (value.includes("/files?")) {
        return jsonResponse(page("file", isFirstPage ? 100 : 1));
      }
      return jsonResponse(page("comment", isFirstPage ? 100 : 1));
    },
  });
  const lookup = { repository: "sample/project", pullRequestNumber: 42 };

  assert.equal((await client.listPullRequestFiles(lookup, 1000)).length, 101);
  assert.equal((await client.listPullRequestReviewComments(lookup)).length, 101);
  assert.equal(requests.filter((url) => url.endsWith("page=2")).length, 2);
});

test("GitHub API client rejects unsafe API base URLs before requests", () => {
  for (const apiUrl of [
    "not a URL",
    "http://github.example/api/v3",
    "https://user:password@github.example/api/v3",
    "https://github.example/api/v3?token=value",
    "https://github.example/api/v3#fragment",
  ]) {
    assert.throws(
      () =>
        createGitHubApiClient({
          token: "test-token",
          apiUrl,
          fetch: async () => {
            throw new Error("fetch must not run");
          },
        }),
      (error) => error instanceof GitHubApiClientError && error.code === "invalid_options",
    );
  }
});

test("GitHub API client fails closed when changed files exceed the requested bound", async () => {
  const client = createGitHubApiClient({
    fetch: async (url) => {
      const value = String(url);
      const count = value.endsWith("page=1") ? 100 : 1;
      return jsonResponse(
        Array.from({ length: count }, (_, index) => ({ filename: `file-${index}.ts` })),
      );
    },
  });

  await assert.rejects(
    () => client.listPullRequestFiles({ repository: "sample/project", pullRequestNumber: 42 }),
    (error) =>
      error instanceof GitHubApiClientError &&
      error.code === "response_too_large" &&
      error.message.includes("100 items"),
  );
});

test("GitHub API client can make unauthenticated public requests", async () => {
  const requests = [];
  const client = createGitHubApiClient({
    fetch: async (url, init) => {
      requests.push(init.headers);
      return jsonResponse({
        number: 42,
        title: "Add parser regression coverage",
        body: null,
        html_url: "https://github.com/sample/project/pull/42",
        merged_at: "2026-07-08T00:00:00.000Z",
        merge_commit_sha: null,
        user: {
          id: 123456,
          login: "octocat",
          html_url: null,
        },
        labels: [],
      });
    },
  });

  await client.getPullRequest({
    repository: "sample/project",
    pullRequestNumber: 42,
  });

  assert.equal("Authorization" in requests[0], false);
});

test("GitHub API client maps permission failures without leaking tokens", async () => {
  const client = createGitHubApiClient({
    token: "secret-token",
    fetch: async () =>
      jsonResponse(
        {
          message: "Bad credentials",
        },
        401,
      ),
  });

  await assert.rejects(
    () =>
      client.getPullRequest({
        repository: "sample/project",
        pullRequestNumber: 42,
      }),
    (error) =>
      error instanceof GitHubApiClientError &&
      error.code === "permission_denied" &&
      error.retryable === false &&
      !error.message.includes("secret-token"),
  );
});

test("GitHub API errors never expose JSON or plain-text response bodies", async () => {
  const marker = "AUDIT_RESPONSE_MARKER";
  const exposed = [];
  for (const [status, code] of [
    [401, "permission_denied"],
    [403, "permission_denied"],
    [404, "not_found"],
    [422, "request_failed"],
    [429, "rate_limited"],
    [503, "server_error"],
  ]) {
    for (const json of [true, false]) {
      const client = createGitHubApiClient({
        fetch: async () =>
          new Response(json ? JSON.stringify({ message: marker }) : marker, { status }),
      });
      await assert.rejects(
        () => client.getPullRequest({ repository: "sample/project", pullRequestNumber: 42 }),
        (error) => {
          assert.ok(error instanceof GitHubApiClientError);
          assert.equal(error.code, code);
          assert.equal(error.retryable, status === 429 || status === 503);
          assert.ok(error.message.length <= 160);
          if (`${error.stack}${JSON.stringify(error)}`.includes(marker))
            exposed.push(`${status}:${json}`);
          return true;
        },
      );
    }
  }
  assert.deepEqual(exposed, []);
});

test("GitHub API client times out stalled requests as retryable failures", async () => {
  const client = createGitHubApiClient({
    timeoutMs: 5,
    fetch: async () => new Promise(() => {}),
  });

  await assert.rejects(
    () => client.getPullRequest({ repository: "sample/project", pullRequestNumber: 42 }),
    (error) =>
      error instanceof GitHubApiClientError && error.code === "timeout" && error.retryable === true,
  );
});

test("GitHub API client rejects oversized responses without marking them retryable", async () => {
  const client = createGitHubApiClient({
    maxResponseBytes: 16,
    fetch: async () => new Response(JSON.stringify({ message: "oversized response" })),
  });

  await assert.rejects(
    () => client.getPullRequest({ repository: "sample/project", pullRequestNumber: 42 }),
    (error) =>
      error instanceof GitHubApiClientError &&
      error.code === "response_too_large" &&
      error.retryable === false,
  );
});

test("GitHub API client classifies rate limits and server failures as retryable", async () => {
  for (const [status, code] of [
    [429, "rate_limited"],
    [503, "server_error"],
  ]) {
    const client = createGitHubApiClient({
      fetch: async () => jsonResponse({ message: "temporary failure" }, status),
    });
    await assert.rejects(
      () => client.getPullRequest({ repository: "sample/project", pullRequestNumber: 42 }),
      (error) =>
        error instanceof GitHubApiClientError && error.code === code && error.retryable === true,
    );
  }
});

test("GitHub API client recognizes primary and secondary rate limits returned as 403", async () => {
  const cases = [
    { message: "API rate limit exceeded", headers: { "x-ratelimit-remaining": "0" } },
    { message: "Please wait before retrying", headers: { "retry-after": "60" } },
    { message: "You have exceeded a secondary rate limit. Please wait a few minutes." },
  ];
  for (const { message, headers } of cases) {
    const client = createGitHubApiClient({
      fetch: async () => new Response(JSON.stringify({ message }), { status: 403, headers }),
    });
    await assert.rejects(
      () => client.getPullRequest({ repository: "sample/project", pullRequestNumber: 42 }),
      (error) =>
        error instanceof GitHubApiClientError &&
        error.code === "rate_limited" &&
        error.retryable === true,
    );
  }
});

test("GitHub API client keeps ordinary 403 and invalid credentials non-retryable", async () => {
  for (const status of [401, 403]) {
    const client = createGitHubApiClient({
      fetch: async () =>
        new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
          status,
          headers: status === 401 ? { "x-ratelimit-remaining": "0" } : undefined,
        }),
    });
    await assert.rejects(
      () => client.getPullRequest({ repository: "sample/project", pullRequestNumber: 42 }),
      (error) =>
        error instanceof GitHubApiClientError &&
        error.code === "permission_denied" &&
        error.retryable === false,
    );
  }
});

test("GitHub API client validates transport budgets before requests", () => {
  assert.throws(
    () => createGitHubApiClient({ timeoutMs: 0 }),
    (error) =>
      error instanceof GitHubApiClientError &&
      error.code === "invalid_options" &&
      error.retryable === false,
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

for (const total of [250, 1000]) {
  test(`partial comment collection takes 25 of ${total} comments in one request`, async () => {
    const requests = [];
    const client = createGitHubApiClient({
      fetch: async (url) => {
        requests.push(String(url));
        const parsed = new URL(url);
        const size = Number(parsed.searchParams.get("per_page"));
        const page = Number(parsed.searchParams.get("page"));
        return jsonResponse(
          Array.from({ length: Math.min(size, total - (page - 1) * size) }, (_, i) => ({
            id: (page - 1) * size + i,
            body: "Review evidence.",
          })),
        );
      },
    });
    const lookup = { repository: "sample/project", pullRequestNumber: 42 };
    assert.equal((await client.listPullRequestReviewComments(lookup, 25)).length, 25);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].includes("per_page=25&page=1"));
    assert.deepEqual(await client.listPullRequestReviewComments(lookup, 0), []);
    assert.equal(requests.length, 1);
  });
}
test("partial pagination uses stable page sizes and stops at the requested count", async () => {
  const requests = [];
  const client = createGitHubApiClient({
    fetch: async (url) => {
      requests.push(String(url));
      const page = Number(new URL(url).searchParams.get("page"));
      return jsonResponse(
        Array.from({ length: 100 }, (_, i) => ({
          id: (page - 1) * 100 + i,
          body: "Review evidence.",
        })),
      );
    },
  });
  const comments = await client.listPullRequestReviewComments(
    { repository: "sample/project", pullRequestNumber: 42 },
    125,
  );
  assert.equal(comments.length, 125);
  assert.equal(comments[124].id, 124);
  assert.equal(requests.length, 2);
});
