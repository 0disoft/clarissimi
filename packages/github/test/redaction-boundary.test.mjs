import assert from "node:assert/strict";
import test from "node:test";

import { prepareEvidenceExcerpt, prepareEvidenceForProvider } from "@clarissimi/core";

import {
  collectLiveMergedPullRequestEvidence,
  collectMergedPullRequestEvidence,
} from "../dist/index.js";

const marker = "PRIVATE" + " KEY";
const material = "synthetic-key-material";
const block = `-----BEGIN ${marker}-----\n${(material + "\n").repeat(180)}-----END ${marker}-----`;
const user = { id: 123456, login: "octocat" };
const pullRequest = {
  number: 42,
  title: "Update parser",
  htmlUrl: "https://github.com/sample/project/pull/42",
  mergedAt: "2026-07-08T00:00:00.000Z",
  user,
};

test("fixture collection redacts complete and incomplete keys before cutting excerpts", () => {
  for (const offset of [0, 1_980, 1_999, 2_001]) {
    for (const key of [block, block.slice(0, block.lastIndexOf("-----END"))]) {
      const raw = "a".repeat(offset) + "\n" + key;
      const collected = collectMergedPullRequestEvidence({
        repository: { fullName: "sample/project" },
        pullRequest: {
          ...pullRequest,
          body: raw,
          changedFiles: [{ filename: "src/parser.ts", patchExcerpt: raw }],
        },
      });
      assertSafeProviderEvidence(collected.evidence, 2);
    }
  }
});

test("live PR bodies, patches and review comments redact before the collector/provider boundary", async () => {
  for (const key of [block, block.slice(0, block.lastIndexOf("-----END"))]) {
    const collected = await collectLiveMergedPullRequestEvidence({
      repository: "sample/project",
      pullRequestNumber: 42,
      client: {
        getPullRequest: async () => ({ ...pullRequest, body: key }),
        listPullRequestFiles: async () => [{ filename: "src/parser.ts", patch: key }],
        listPullRequestReviewComments: async () => [{ id: 9001, body: key }],
      },
    });
    assertSafeProviderEvidence(collected.evidence, 3);
  }
});

test("excerpt bounds include the truncation suffix and keep diagnostic offsets without values", () => {
  assert.equal(prepareEvidenceExcerpt("a".repeat(2_001)).excerpt.length, 2_000);
  assert.deepEqual(prepareEvidenceExcerpt(" \n "), {});
  assert.throws(() => prepareEvidenceExcerpt("text", 2), RangeError);
  const result = prepareEvidenceExcerpt(block);
  assert.equal(result.excerptRedactionReport.occurrences[0].end, block.length);
  assert.equal(JSON.stringify(result).includes(material), false);
});

function assertSafeProviderEvidence(evidence, expectedMatches) {
  assert.equal(JSON.stringify(evidence).includes(material), false);
  const prepared = prepareEvidenceForProvider(evidence);
  assert.equal(JSON.stringify(prepared).includes(material), false);
  assert.equal(prepared.redactionReport.occurrences.length, expectedMatches);
  assert.equal(prepared.redactionReport.changed, true);
  for (const item of prepared.items) {
    if (item.excerpt !== undefined) assert.ok(item.excerpt.length <= 2_000);
  }
}
