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
  assert.equal(client.deleted.length, 0);
  assert.equal(result.body.includes("Clarissimi recognition proposal"), true);
  assert.equal(result.body.includes("raw evidence"), false);
});

test("source pull request comment converges concurrent creation on the lowest comment id", async () => {
  const client = new RacingCommentClient();

  const result = await upsertSourcePullRequestComment(input(client));

  assert.equal(result.action, "created");
  assert.equal(result.comment.id, 7);
  assert.deepEqual(client.deleted, [8]);
  assert.deepEqual(
    client.comments.map((value) => value.id),
    [7],
  );
});

test("source pull request comment removes its own later racing duplicate", async () => {
  const client = new LaterRacingCommentClient();

  const result = await upsertSourcePullRequestComment(input(client));

  assert.equal(result.action, "unchanged");
  assert.equal(result.comment.id, 6);
  assert.deepEqual(client.deleted, [7]);
});

test("source pull request comment rolls back creation when reconciliation is incomplete", async () => {
  const client = new IncompleteAfterCreateCommentClient();

  await assert.rejects(
    () => upsertSourcePullRequestComment(input(client)),
    (error) =>
      error instanceof SourcePullRequestCommentError &&
      error.code === "comment_scan_incomplete_after_create",
  );
  assert.deepEqual(client.deleted, [7]);
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
  deleted = [];

  constructor(comments = [], complete = true) {
    this.comments = comments;
    this.complete = complete;
  }

  async listPullRequestComments() {
    return { comments: this.comments, complete: this.complete };
  }

  async createPullRequestComment(value) {
    this.created.push(value);
    const created = comment({ id: 7, body: value.body });
    this.comments.push(created);
    return created;
  }

  async updatePullRequestComment(value) {
    this.updated.push(value);
    return comment({ id: value.commentId, body: value.body });
  }

  async deletePullRequestComment(value) {
    this.deleted.push(value.commentId);
    this.comments = this.comments.filter((entry) => entry.id !== value.commentId);
  }
}

class RacingCommentClient extends FakeCommentClient {
  async createPullRequestComment(value) {
    const created = await super.createPullRequestComment(value);
    this.comments.push(comment({ id: 8, body: value.body }));
    return created;
  }
}

class LaterRacingCommentClient extends FakeCommentClient {
  async createPullRequestComment(value) {
    const created = await super.createPullRequestComment(value);
    this.comments.unshift(comment({ id: 6, body: value.body }));
    return created;
  }
}

class IncompleteAfterCreateCommentClient extends FakeCommentClient {
  scans = 0;

  async listPullRequestComments() {
    this.scans += 1;
    return { comments: this.comments, complete: this.scans === 1 };
  }
}
