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

test("GitHub pull request client retries safe requests after transient HTML failures", async () => {
  const sleeps = [];
  let attempts = 0;
  const client = createGitHubPullRequestClient({
    token: "test-token",
    random: () => 0.5,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) {
        return textResponse("<html><body>Unicorn! request timed out</body></html>", 503);
      }
      return jsonResponse([pullRequestResponse(6)]);
    },
  });

  const pullRequest = await client.findOpenPullRequest(lookupInput());

  assert.equal(pullRequest.number, 6);
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [500]);
});

test("GitHub pull request client reconciles an ambiguous create before retrying POST", async () => {
  const methods = [];
  const sleeps = [];
  const client = createGitHubPullRequestClient({
    token: "test-token",
    random: () => 0.5,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetch: async (_url, init) => {
      methods.push(init.method);
      if (init.method === "POST") {
        throw new TypeError("socket disconnected");
      }
      return jsonResponse([pullRequestResponse(7)]);
    },
  });

  const pullRequest = await client.createPullRequest(createInput());

  assert.equal(pullRequest.number, 7);
  assert.deepEqual(methods, ["POST", "GET"]);
  assert.deepEqual(sleeps, [500]);
});

test("GitHub pull request client retries create only after reconciliation finds no pull request", async () => {
  const methods = [];
  let postAttempts = 0;
  const client = createGitHubPullRequestClient({
    token: "test-token",
    random: () => 0.5,
    sleep: async () => {},
    fetch: async (_url, init) => {
      methods.push(init.method);
      if (init.method === "GET") {
        return jsonResponse([]);
      }
      postAttempts += 1;
      return postAttempts === 1
        ? textResponse("temporary upstream failure", 502)
        : jsonResponse(pullRequestResponse(8));
    },
  });

  const pullRequest = await client.createPullRequest(createInput());

  assert.equal(pullRequest.number, 8);
  assert.deepEqual(methods, ["POST", "GET", "POST"]);
});

test("GitHub pull request client reconciles a racing 422 create response", async () => {
  const methods = [];
  const client = createGitHubPullRequestClient({
    token: "test-token",
    fetch: async (_url, init) => {
      methods.push(init.method);
      return init.method === "POST"
        ? jsonResponse({ message: "Validation Failed" }, 422)
        : jsonResponse([pullRequestResponse(9)]);
    },
  });

  const pullRequest = await client.createPullRequest(createInput());

  assert.equal(pullRequest.number, 9);
  assert.deepEqual(methods, ["POST", "GET"]);
});

test("GitHub pull request client reconciles create before honoring an excessive Retry-After stop", async () => {
  const methods = [];
  const sleeps = [];
  const client = createGitHubPullRequestClient({
    token: "test-token",
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetch: async (_url, init) => {
      methods.push(init.method);
      return init.method === "POST"
        ? textResponse("upstream unavailable", 503, { "retry-after": "61" })
        : jsonResponse([pullRequestResponse(10)]);
    },
  });

  const pullRequest = await client.createPullRequest(createInput());

  assert.equal(pullRequest.number, 10);
  assert.deepEqual(methods, ["POST", "GET"]);
  assert.deepEqual(sleeps, []);
});

test("GitHub pull request client bounds timeouts and oversized responses", async () => {
  let timeoutAttempts = 0;
  const timeoutClient = createGitHubPullRequestClient({
    token: "test-token",
    timeoutMs: 1,
    random: () => 0.5,
    sleep: async () => {},
    fetch: async () => {
      timeoutAttempts += 1;
      return await new Promise(() => {});
    },
  });

  await assert.rejects(
    () => timeoutClient.findOpenPullRequest(lookupInput()),
    (error) =>
      error instanceof ProposalPullRequestClientError &&
      error.code === "timeout" &&
      error.retryable === true,
  );
  assert.equal(timeoutAttempts, 3);

  let oversizedAttempts = 0;
  const oversizedClient = createGitHubPullRequestClient({
    token: "test-token",
    maxResponseBytes: 8,
    fetch: async () => {
      oversizedAttempts += 1;
      return textResponse("123456789", 200, { "content-length": "9" });
    },
  });

  await assert.rejects(
    () => oversizedClient.findOpenPullRequest(lookupInput()),
    (error) =>
      error instanceof ProposalPullRequestClientError &&
      error.code === "response_too_large" &&
      error.retryable === false,
  );
  assert.equal(oversizedAttempts, 1);
});

test("GitHub pull request client does not log raw HTML or retry an excessive Retry-After", async () => {
  const sleeps = [];
  let attempts = 0;
  const client = createGitHubPullRequestClient({
    token: "test-token",
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetch: async () => {
      attempts += 1;
      return textResponse("<html><body>secret-looking upstream diagnostics</body></html>", 503, {
        "retry-after": "61",
      });
    },
  });

  await assert.rejects(
    () => client.findOpenPullRequest(lookupInput()),
    (error) =>
      error instanceof ProposalPullRequestClientError &&
      error.code === "server_error" &&
      !error.message.includes("secret-looking") &&
      error.retryAfterMs === 61_000,
  );
  assert.equal(attempts, 1);
  assert.deepEqual(sleeps, []);
});

test("GitHub pull request client rejects invalid transport budgets", () => {
  assert.throws(
    () => createGitHubPullRequestClient({ token: "test-token", timeoutMs: 0 }),
    (error) => error instanceof ProposalPullRequestClientError && error.code === "invalid_options",
  );
  assert.throws(
    () => createGitHubPullRequestClient({ token: "test-token", maxResponseBytes: -1 }),
    (error) => error instanceof ProposalPullRequestClientError && error.code === "invalid_options",
  );
});

function lookupInput() {
  return {
    repository: "sample/project",
    headBranch: "clarissimi/recognition/merged_pull_request-42",
    baseBranch: "main",
  };
}

function createInput() {
  return {
    ...lookupInput(),
    title: "Clarissimi recognition: sample/project#42",
    body: "bounded body",
  };
}

function pullRequestResponse(number) {
  return {
    number,
    html_url: `https://github.com/sample/project/pull/${number}`,
    title: "Clarissimi recognition: sample/project#42",
    head: {
      ref: "clarissimi/recognition/merged_pull_request-42",
    },
    base: {
      ref: "main",
    },
  };
}

function jsonResponse(body, status = 200) {
  return textResponse(JSON.stringify(body), status, { "content-type": "application/json" });
}

function textResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    async text() {
      return body;
    },
  };
}
