import assert from "node:assert/strict";
import test from "node:test";

import { ProposalPullRequestClientError, createGitHubPullRequestClient } from "../dist/index.js";

test("GitHub pull request client creates bounded REST requests", async () => {
  const requests = [];
  const client = createGitHubPullRequestClient({
    token: "test-token",
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body,
        authorization: init.headers.Authorization,
      });
      return jsonResponse({
        number: 5,
        html_url: "https://github.com/sample/project/pull/5",
        title: "Clarissimi recognition: sample/project#42",
        head: {
          ref: "clarissimi/recognition/merged_pull_request-42",
        },
        base: {
          ref: "main",
        },
      });
    },
  });

  const pullRequest = await client.createPullRequest({
    repository: "sample/project",
    headBranch: "clarissimi/recognition/merged_pull_request-42",
    baseBranch: "main",
    title: "Clarissimi recognition: sample/project#42",
    body: "bounded body",
  });

  assert.equal(pullRequest.number, 5);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.github.com/repos/sample/project/pulls");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(requests[0].body), {
    title: "Clarissimi recognition: sample/project#42",
    body: "bounded body",
    head: "clarissimi/recognition/merged_pull_request-42",
    base: "main",
  });
});

test("GitHub pull request client finds open proposal pull requests", async () => {
  let requestedUrl = "";
  const client = createGitHubPullRequestClient({
    token: "test-token",
    apiUrl: "https://github.example/api/v3/",
    fetch: async (url) => {
      requestedUrl = String(url);
      return jsonResponse([
        {
          number: 6,
          html_url: "https://github.example/sample/project/pull/6",
          title: "Clarissimi recognition: sample/project#42",
          head: {
            ref: "clarissimi/recognition/merged_pull_request-42",
          },
          base: {
            ref: "main",
          },
        },
      ]);
    },
  });

  const pullRequest = await client.findOpenPullRequest({
    repository: "sample/project",
    headBranch: "clarissimi/recognition/merged_pull_request-42",
    baseBranch: "main",
  });

  assert.equal(pullRequest.number, 6);
  assert.equal(
    requestedUrl,
    "https://github.example/api/v3/repos/sample/project/pulls?state=open&head=sample%3Aclarissimi%2Frecognition%2Fmerged_pull_request-42&base=main",
  );
});

test("GitHub pull request client maps permission failures without leaking tokens", async () => {
  const client = createGitHubPullRequestClient({
    token: "secret-token",
    fetch: async () =>
      jsonResponse(
        {
          message: "Resource not accessible by integration",
        },
        403,
      ),
  });

  await assert.rejects(
    () =>
      client.createPullRequest({
        repository: "sample/project",
        headBranch: "clarissimi/recognition/merged_pull_request-42",
        baseBranch: "main",
        title: "Clarissimi recognition: sample/project#42",
        body: "bounded body",
      }),
    (error) =>
      error instanceof ProposalPullRequestClientError &&
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
