import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import { ASSESSMENT_SCHEMA_VERSION } from "@clarissimi/schemas";

import { validateProviderAssessmentResult } from "../dist/index.js";

const corpusUrl = new URL("./fixtures/result-quality-corpus.json", import.meta.url);
const corpus = JSON.parse(await readFile(corpusUrl, "utf8"));

test("provider result quality corpus contains 24 balanced synthetic pull requests", () => {
  assert.equal(corpus.schemaVersion, "clarissimi.provider-result-quality-corpus/v1");
  assert.equal(corpus.cases.length, 24);
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, 24);
  assert.equal(corpus.cases.filter((entry) => entry.expectedIssueCodes.length === 0).length, 12);
  assert.equal(corpus.cases.filter((entry) => entry.expectedIssueCodes.length > 0).length, 12);
});

for (const [index, entry] of corpus.cases.entries()) {
  test(`provider result quality corpus: ${entry.id}`, () => {
    const source = {
      repository: "example/quality-corpus",
      event: "merged_pull_request",
      pullRequestNumber: index + 1,
      mergedAt: `2026-07-${String((index % 12) + 1).padStart(2, "0")}T00:00:00.000Z`,
    };
    const preparedEvidence = prepareEvidenceForProvider({
      source,
      items: entry.items,
    });
    const input = {
      contributor: corpus.contributor,
      preparedEvidence,
      ...(entry.hints === undefined ? {} : { hints: entry.hints }),
    };
    const trustedOverrides = entry.trustedOverrides ?? {};
    const evidenceRefs = overrideEvidenceRefs(
      preparedEvidence.evidenceRefs,
      trustedOverrides.evidenceRefs,
    );
    const candidate = {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      contributor: {
        ...corpus.contributor,
        ...(trustedOverrides.contributorLogin === undefined
          ? {}
          : { login: trustedOverrides.contributorLogin }),
      },
      ...corpus.baseCandidate,
      ...entry.candidate,
      evidenceRefs,
      maintainerApprovalStatus: trustedOverrides.approvalStatus ?? "draft",
      source: {
        ...source,
        ...(trustedOverrides.pullRequestNumber === undefined
          ? {}
          : { pullRequestNumber: trustedOverrides.pullRequestNumber }),
      },
    };

    const result = validateProviderAssessmentResult(input, candidate);
    const actualCodes = [...new Set(result.issues.map((issue) => issue.code))].sort();
    const expectedCodes = [...entry.expectedIssueCodes].sort();
    assert.deepEqual(actualCodes, expectedCodes);
    assert.equal(result.ok, expectedCodes.length === 0);
  });
}

function overrideEvidenceRefs(evidenceRefs, mode) {
  if (mode === "drop-last") {
    return evidenceRefs.slice(0, -1);
  }
  if (mode === "append-extra") {
    return [...evidenceRefs, { kind: "file", id: "invented-by-provider.ts" }];
  }
  return evidenceRefs;
}
