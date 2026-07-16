import assert from "node:assert/strict";
import test from "node:test";

import { LiveGitHubCollectionError, collectLiveMergedPullRequestEvidence } from "../dist/index.js";

function livePullRequest(overrides = {}) {
  return {
    number: 42,
    title: "Add parser regression coverage for #7",
    body: "Adds a failing parser case and closes sample/project#8.",
    htmlUrl: "https://github.com/sample/project/pull/42",
    mergedAt: "2026-07-08T00:00:00.000Z",
    mergeCommitSha: "abc123def4567890",
    user: {
      id: 123456,
      login: "octocat",
      htmlUrl: "https://github.com/octocat",
    },
    labels: [
      {
        name: "tests",
      },
      {
        name: "maintenance",
      },
    ],
    ...overrides,
  };
}

const files = [
  {
    filename: "src/parser.ts",
    status: "modified",
    additions: 8,
    deletions: 2,
    patch: "export function parseNestedInput()",
  },
  {
    filename: "tests/parser.spec.ts",
    status: "added",
    additions: 32,
    deletions: 0,
    patch: 'test("parses nested input", () => {})',
  },
];

const reviewComments = [
  {
    id: 9001,
    body: "This catches the parser regression.",
    htmlUrl: "https://github.com/sample/project/pull/42#discussion_r9001",
    path: "tests/parser.spec.ts",
    diffHunk: "@@ -0,0 +1,12 @@",
  },
];

test("collects live merged pull request evidence through an injected client", async () => {
  const collected = await collectLiveMergedPullRequestEvidence({
    client: new FakeLiveClient(),
    repository: "sample/project",
    pullRequestNumber: 42,
  });

  assert.deepEqual(collected.contributor, {
    platform: "github",
    id: "123456",
    login: "octocat",
    profileUrl: "https://github.com/octocat",
  });
  assert.deepEqual(collected.evidence.source, {
    repository: "sample/project",
    event: "merged_pull_request",
    pullRequestNumber: 42,
    mergedAt: "2026-07-08T00:00:00.000Z",
  });
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "pull_request"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "label"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "file"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "test"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "commit"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "review"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "issue" && item.id === "#7"),
    true,
  );
  assert.equal(
    collected.evidence.items.some((item) => item.kind === "issue" && item.id === "#8"),
    true,
  );
});

test("bounds review comments and linked issue candidates", async () => {
  const collected = await collectLiveMergedPullRequestEvidence({
    client: new FakeLiveClient({
      pullRequest: livePullRequest({
        title: "Fix #1 #2 #3",
        body: "Also references #4 and #5",
      }),
      reviewComments: [
        ...reviewComments,
        {
          id: 9002,
          body: "second comment",
          htmlUrl: "https://github.com/sample/project/pull/42#discussion_r9002",
          path: "src/parser.ts",
        },
      ],
    }),
    repository: "sample/project",
    pullRequestNumber: 42,
    linkedIssueLimit: 2,
    reviewCommentLimit: 1,
  });

  const issues = collected.evidence.items.filter((item) => item.kind === "issue");
  const reviews = collected.evidence.items.filter((item) => item.kind === "review");

  assert.deepEqual(
    issues.map((item) => item.id),
    ["#1", "#2"],
  );
  assert.equal(reviews.length, 1);
  assert.equal(JSON.stringify(collected).includes("@@ -0,0 +1,12 @@"), false);
});

test("rejects unmerged live pull requests before returning evidence", async () => {
  await assert.rejects(
    () =>
      collectLiveMergedPullRequestEvidence({
        client: new FakeLiveClient({
          pullRequest: livePullRequest({ mergedAt: null }),
        }),
        repository: "sample/project",
        pullRequestNumber: 42,
      }),
    (error) =>
      error instanceof LiveGitHubCollectionError && error.code === "pull_request_not_merged",
  );
});

test("rejects live pull request number mismatches", async () => {
  await assert.rejects(
    () =>
      collectLiveMergedPullRequestEvidence({
        client: new FakeLiveClient({
          pullRequest: livePullRequest({ number: 41 }),
        }),
        repository: "sample/project",
        pullRequestNumber: 42,
      }),
    (error) =>
      error instanceof LiveGitHubCollectionError && error.code === "pull_request_number_mismatch",
  );
});

test("fails closed when live changed files exceed the configured bound", async () => {
  await assert.rejects(
    () =>
      collectLiveMergedPullRequestEvidence({
        client: new FakeLiveClient({
          files: Array.from({ length: 101 }, (_, index) => ({
            filename: `src/file-${index}.ts`,
          })),
        }),
        repository: "sample/project",
        pullRequestNumber: 42,
      }),
    (error) => error instanceof LiveGitHubCollectionError && error.code === "changed_file_limit",
  );
});

test("rejects invalid live collector inputs before calling the client", async () => {
  const client = new FakeLiveClient();

  await assert.rejects(
    () =>
      collectLiveMergedPullRequestEvidence({
        client,
        repository: "not-a-full-name",
        pullRequestNumber: 42,
      }),
    LiveGitHubCollectionError,
  );
  assert.equal(client.calls.length, 0);
});

class FakeLiveClient {
  calls = [];
  #pullRequest;
  #files;
  #reviewComments;

  constructor(options = {}) {
    this.#pullRequest = options.pullRequest ?? livePullRequest();
    this.#files = options.files ?? files;
    this.#reviewComments = options.reviewComments ?? reviewComments;
  }

  async getPullRequest(input) {
    this.calls.push(["getPullRequest", input]);
    return this.#pullRequest;
  }

  async listPullRequestFiles(input, limit) {
    this.calls.push(["listPullRequestFiles", input, limit]);
    return this.#files;
  }

  async listPullRequestReviewComments(input) {
    this.calls.push(["listPullRequestReviewComments", input]);
    return this.#reviewComments;
  }
}
