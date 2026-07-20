import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ReviewGateError, runActionReviewGate } from "../dist/index.js";

const headSha = "a".repeat(40);

test("advisory gate reports a missing decision without blocking", async () => {
  await withEvent(async (eventPath) => {
    const summary = await runActionReviewGate({
      eventPath,
      gateMode: "advisory",
      commentClient: commentClient([]),
    });
    assert.equal(summary.gatePassed, false);
    assert.equal(summary.gateDecision, null);
  });
});

test("required gate accepts one trusted decision for the current head", async () => {
  await withEvent(async (eventPath) => {
    const summary = await runActionReviewGate({
      eventPath,
      gateMode: "required",
      commentClient: commentClient([decisionComment({ headSha })]),
    });
    assert.equal(summary.gatePassed, true);
    assert.equal(summary.gateDecision, "approved");
  });
});

test("required gate accepts skip and visible audit text after a case-insensitive repository match", async () => {
  await withEvent(async (eventPath) => {
    const comment = decisionComment({ headSha, decision: "skip", repository: "Example/Project" });
    comment.body += "\n\nClarissimi decision: skip this PR from recognition.";
    const summary = await runActionReviewGate({
      eventPath,
      gateMode: "required",
      commentClient: commentClient([comment]),
    });
    assert.equal(summary.gatePassed, true);
    assert.equal(summary.gateDecision, "skip");
  });
});

test("required gate rejects missing stale untrusted and duplicate decisions", async () => {
  await withEvent(async (eventPath) => {
    for (const comments of [
      [],
      [decisionComment({ headSha: "b".repeat(40) })],
      [decisionComment({ headSha, authorAssociation: "CONTRIBUTOR" })],
      [decisionComment({ headSha }), decisionComment({ id: 2, headSha, decision: "skip" })],
    ]) {
      await assert.rejects(
        () =>
          runActionReviewGate({
            eventPath,
            gateMode: "required",
            commentClient: commentClient(comments),
          }),
        (error) => error instanceof ReviewGateError && error.code === "review_decision_required",
      );
    }
  });
});

function decisionComment({
  id = 1,
  headSha: decisionHeadSha,
  decision = "approved",
  authorAssociation = "OWNER",
  repository = "example/project",
}) {
  return {
    id,
    url: `https://github.com/example/project/pull/42#issuecomment-${id}`,
    body: [
      "<!-- clarissimi:review-decision:v1",
      JSON.stringify({
        schemaVersion: "clarissimi.review-decision/v1",
        repository,
        pullRequestNumber: 42,
        headSha: decisionHeadSha,
        decision,
        reason: "Maintainer reviewed the current PR revision.",
      }),
      "-->",
    ].join("\n"),
    authorLogin: "maintainer",
    authorType: "User",
    authorAssociation,
  };
}

function commentClient(comments) {
  return {
    async listPullRequestComments() {
      return { comments, complete: true };
    },
    async createPullRequestComment() {
      throw new Error("not used");
    },
    async updatePullRequestComment() {
      throw new Error("not used");
    },
    async deletePullRequestComment() {
      throw new Error("not used");
    },
  };
}

async function withEvent(run) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-review-gate-"));
  try {
    const eventPath = join(dir, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify({
        repository: { full_name: "example/project" },
        pull_request: { number: 42, head: { sha: headSha } },
      }),
      "utf8",
    );
    await run(eventPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
