import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubEvidenceCollectionError,
  collectMergedPullRequestEvidence
} from "../dist/index.js";

const fixture = {
  repository: {
    fullName: "sample/project"
  },
  pullRequest: {
    number: 42,
    title: "Add parser regression coverage",
    body: "Adds a failing parser case and keeps it covered.",
    htmlUrl: "https://github.com/sample/project/pull/42",
    mergedAt: "2026-07-08T00:00:00.000Z",
    user: {
      id: 123456,
      login: "octocat"
    },
    labels: [
      {
        name: "tests"
      },
      {
        name: "maintenance"
      }
    ],
    changedFiles: [
      {
        filename: "src/parser.ts",
        status: "modified",
        additions: 8,
        deletions: 2,
        patchExcerpt: "export function parseNestedInput()"
      },
      {
        filename: "tests/parser.spec.ts",
        status: "added",
        additions: 32,
        deletions: 0,
        patchExcerpt: "test(\"parses nested input\", () => {})"
      }
    ],
    mergeCommitSha: "abc123def4567890"
  }
};

test("collects merged pull request fixture evidence", () => {
  const collected = collectMergedPullRequestEvidence(fixture);

  assert.deepEqual(collected.contributor, {
    platform: "github",
    id: "123456",
    login: "octocat",
    profileUrl: "https://github.com/octocat"
  });
  assert.deepEqual(collected.evidence.source, {
    repository: "sample/project",
    event: "merged_pull_request",
    pullRequestNumber: 42,
    mergedAt: "2026-07-08T00:00:00.000Z"
  });
  assert.equal(collected.evidence.items[0].kind, "pull_request");
  assert.equal(collected.evidence.items[0].id, "PR-42");
  assert.equal(collected.evidence.items.some((item) => item.kind === "label"), true);
  assert.equal(collected.evidence.items.some((item) => item.kind === "file"), true);
  assert.equal(collected.evidence.items.some((item) => item.kind === "test"), true);
  assert.equal(collected.evidence.items.some((item) => item.kind === "commit"), true);
});

test("preserves explicit contributor profile URL", () => {
  const collected = collectMergedPullRequestEvidence({
    ...fixture,
    pullRequest: {
      ...fixture.pullRequest,
      user: {
        id: "node-123",
        login: "maintainer",
        htmlUrl: "https://github.com/maintainer"
      }
    }
  });

  assert.equal(collected.contributor.id, "node-123");
  assert.equal(collected.contributor.profileUrl, "https://github.com/maintainer");
});

test("deduplicates repeated labels and files while preserving order", () => {
  const collected = collectMergedPullRequestEvidence({
    ...fixture,
    pullRequest: {
      ...fixture.pullRequest,
      labels: [
        {
          name: "tests"
        },
        {
          name: "tests"
        }
      ],
      changedFiles: [
        {
          filename: "tests/parser.spec.ts"
        },
        {
          filename: "tests/parser.spec.ts"
        }
      ]
    }
  });

  const labels = collected.evidence.items.filter((item) => item.kind === "label");
  const tests = collected.evidence.items.filter((item) => item.kind === "test");

  assert.equal(labels.length, 1);
  assert.equal(tests.length, 1);
});

test("rejects invalid repository names before evidence leaves the collector", () => {
  assert.throws(
    () =>
      collectMergedPullRequestEvidence({
        ...fixture,
        repository: {
          fullName: "not-a-repository-full-name"
        }
      }),
    GitHubEvidenceCollectionError
  );
});
test("rejects non-https fixture URLs", () => {
  assert.throws(
    () =>
      collectMergedPullRequestEvidence({
        ...fixture,
        pullRequest: {
          ...fixture.pullRequest,
          htmlUrl: "http://github.com/sample/project/pull/42"
        }
      }),
    GitHubEvidenceCollectionError
  );
});
