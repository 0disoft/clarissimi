import assert from "node:assert/strict";
import test from "node:test";

import {
  SourcePullRequestCommentError,
  buildSourcePullRequestCommentBody,
  upsertSourcePullRequestComment,
} from "../dist/index.js";

test("source pull request comment creates one managed status comment", async () => {
  const client = new FakeCommentClient([
    comment({ id: 1, body: "<!-- clarissimi:source-status:v1 --> spoof", authorLogin: "user" }),
  ]);

  const result = await upsertSourcePullRequestComment(input(client));

  assert.equal(result.action, "created");
  assert.equal(client.created.length, 1);
  assert.equal(client.updated.length, 0);
  assert.equal(result.body.includes("Clarissimi recognition proposal"), true);
  assert.equal(result.body.includes("raw evidence"), false);
});

test("source pull request comment updates only the GitHub Actions managed marker", async () => {
  const client = new FakeCommentClient([
    comment({ id: 2, body: "<!-- clarissimi:source-status:v1 --> old" }),
    comment({
      id: 3,
      body: "<!-- clarissimi:source-status:v1 --> other bot",
      authorLogin: "other-app[bot]",
      appSlug: "other-app",
    }),
  ]);

  const result = await upsertSourcePullRequestComment(input(client));

  assert.equal(result.action, "updated");
  assert.deepEqual(
    client.updated.map((entry) => entry.commentId),
    [2],
  );
  assert.equal(client.created.length, 0);
});

test("source pull request comment leaves identical managed content unchanged", async () => {
  const expected = buildSourcePullRequestCommentBody({
    repository: "sample/project",
    pullRequestNumber: 42,
    proposalKind: "recognition",
    proposalPullRequestNumber: 9,
    proposalPullRequestUrl: "https://github.com/sample/project/pull/9",
  });
  const client = new FakeCommentClient([comment({ id: 4, body: expected })]);

  const result = await upsertSourcePullRequestComment(input(client));

  assert.equal(result.action, "unchanged");
  assert.equal(client.created.length, 0);
  assert.equal(client.updated.length, 0);
});

test("source pull request comment fails closed for incomplete or duplicate managed scans", async () => {
  const incomplete = new FakeCommentClient([], false);
  await assert.rejects(
    () => upsertSourcePullRequestComment(input(incomplete)),
    (error) =>
      error instanceof SourcePullRequestCommentError && error.code === "comment_scan_incomplete",
  );
  assert.equal(incomplete.created.length, 0);

  const duplicate = new FakeCommentClient([comment({ id: 5 }), comment({ id: 6 })]);
  await assert.rejects(
    () => upsertSourcePullRequestComment(input(duplicate)),
    (error) =>
      error instanceof SourcePullRequestCommentError && error.code === "multiple_managed_comments",
  );
  assert.equal(duplicate.created.length, 0);
  assert.equal(duplicate.updated.length, 0);
});

test("source pull request comment rejects unsafe proposal URLs", () => {
  assert.throws(
    () =>
      buildSourcePullRequestCommentBody({
        repository: "sample/project",
        pullRequestNumber: 42,
        proposalKind: "recognition",
        proposalPullRequestNumber: 9,
        proposalPullRequestUrl: "javascript:alert(1)",
      }),
    (error) =>
      error instanceof SourcePullRequestCommentError && error.code === "invalid_proposal_url",
  );
});

function input(client) {
  return {
    client,
    repository: "sample/project",
    pullRequestNumber: 42,
    proposalKind: "recognition",
    proposalPullRequestNumber: 9,
    proposalPullRequestUrl: "https://github.com/sample/project/pull/9",
  };
}

function comment(overrides = {}) {
  return {
    id: 1,
    url: "https://github.com/sample/project/pull/42#issuecomment-1",
    body: "<!-- clarissimi:source-status:v1 --> old",
    authorLogin: "github-actions[bot]",
    authorType: "Bot",
    appSlug: "github-actions",
    ...overrides,
  };
}

class FakeCommentClient {
  created = [];
  updated = [];

  constructor(comments, complete = true) {
    this.comments = comments;
    this.complete = complete;
  }

  async listPullRequestComments() {
    return { comments: this.comments, complete: this.complete };
  }

  async createPullRequestComment(value) {
    this.created.push(value);
    return comment({ id: 7, body: value.body });
  }

  async updatePullRequestComment(value) {
    this.updated.push(value);
    return comment({ id: value.commentId, body: value.body });
  }
}
