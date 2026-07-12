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
            login: "octocat",
            html_url: "https://github.com/octocat",
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

  assert.equal(pullRequest.user.login, "octocat");
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

  assert.equal((await client.listPullRequestFiles(lookup)).length, 101);
  assert.equal((await client.listPullRequestReviewComments(lookup)).length, 101);
  assert.equal(requests.filter((url) => url.endsWith("page=2")).length, 2);
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
      !error.message.includes("secret-token"),
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
