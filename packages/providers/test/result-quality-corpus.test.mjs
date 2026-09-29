import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import { ASSESSMENT_SCHEMA_VERSION } from "@clarissimi/schemas";

import { validateProviderAssessmentResult } from "../dist/index.js";

const corpusUrl = new URL("./fixtures/result-quality-corpus.json", import.meta.url);
const corpus = JSON.parse(await readFile(corpusUrl, "utf8"));

test("provider result quality corpus contains 28 balanced synthetic pull requests", () => {
  assert.equal(corpus.schemaVersion, "clarissimi.provider-result-quality-corpus/v1");
  assert.equal(corpus.cases.length, 28);
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, 28);
  assert.equal(corpus.cases.filter((entry) => entry.expectedIssueCodes.length === 0).length, 14);
  assert.equal(corpus.cases.filter((entry) => entry.expectedIssueCodes.length > 0).length, 14);
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
          : {
              login: trustedOverrides.contributorLogin,
              profileUrl: `https://github.com/${trustedOverrides.contributorLogin}`,
            }),
      },
      ...corpus.baseCandidate,
      ...entry.candidate,
      evidenceRefs,
      ...(evidenceRefs.length === 0
        ? {}
        : {
            claimEvidenceLinks: entry.candidate.claimEvidenceLinks ?? [
              {
                field: "evidenceSummary",
                text: entry.candidate.evidenceSummary ?? corpus.baseCandidate.evidenceSummary,
                evidenceRefIndexes: evidenceRefs.map((_, refIndex) => refIndex),
              },
              {
                field: "publicRecognitionText",
                text:
                  entry.candidate.publicRecognitionText ??
                  corpus.baseCandidate.publicRecognitionText,
                evidenceRefIndexes: evidenceRefs.map((_, refIndex) => refIndex),
              },
            ],
          }),
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

test("provider claims must link to relevant security, regression, or measurement evidence", () => {
  const source = {
    repository: "example/quality-corpus",
    event: "merged_pull_request",
    pullRequestNumber: 99,
    mergedAt: "2026-07-09T00:00:00.000Z",
  };
  const preparedEvidence = prepareEvidenceForProvider({
    source,
    items: [
      { kind: "file", id: "src/parser.ts" },
      { kind: "label", id: "label:security", title: "security" },
      { kind: "test", id: "tests/parser-regression.test.ts" },
      { kind: "test", id: "tests/parser-benchmark.test.ts" },
    ],
  });
  const input = { contributor: corpus.contributor, preparedEvidence };
  for (const { contributionType, claim, supportingIndex, issueCode } of [
    {
      contributionType: "security",
      claim: "Addressed a security issue.",
      supportingIndex: 1,
      issueCode: "provider_result_security_claim_unlinked",
    },
    {
      contributionType: "test",
      claim: "Added regression coverage.",
      supportingIndex: 2,
      issueCode: "provider_result_regression_claim_unlinked",
    },
    {
      contributionType: "performance",
      claim: "Reduced latency.",
      supportingIndex: 3,
      issueCode: "provider_result_performance_claim_unlinked",
    },
  ]) {
    const candidate = {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      contributor: corpus.contributor,
      contributionType,
      affectedArea: "parser",
      impactLevel: "medium",
      evidenceSummary: claim,
      evidenceRefs: preparedEvidence.evidenceRefs,
      suggestedBadge: "Parser Care",
      publicRecognitionText: claim,
      confidence: 0.75,
      maintainerApprovalStatus: "draft",
      source,
      claimEvidenceLinks: [
        { field: "evidenceSummary", text: claim, evidenceRefIndexes: [0] },
        { field: "publicRecognitionText", text: claim, evidenceRefIndexes: [0] },
      ],
    };
    const unlinked = validateProviderAssessmentResult(input, candidate);
    assert.equal(unlinked.ok, false, issueCode);
    assert.equal(
      unlinked.issues.some((issue) => issue.code === issueCode),
      true,
      issueCode,
    );
    const linked = validateProviderAssessmentResult(input, {
      ...candidate,
      claimEvidenceLinks: candidate.claimEvidenceLinks.map((link) => ({
        ...link,
        evidenceRefIndexes: [supportingIndex],
      })),
    });
    assert.equal(linked.ok, true, issueCode);
    if (contributionType === "test") {
      const splitClaim = validateProviderAssessmentResult(input, {
        ...candidate,
        claimEvidenceLinks: [
          { field: "evidenceSummary", text: "Added regression", evidenceRefIndexes: [0] },
          { field: "evidenceSummary", text: "coverage.", evidenceRefIndexes: [supportingIndex] },
          { field: "publicRecognitionText", text: claim, evidenceRefIndexes: [supportingIndex] },
        ],
      });
      assert.equal(splitClaim.ok, false);
      assert.equal(
        splitClaim.issues.some(
          (issue) => issue.code === issueCode && issue.path === "$.claimEvidenceLinks[0]",
        ),
        true,
      );
    }
  }
});

function overrideEvidenceRefs(evidenceRefs, mode) {
  if (mode === "drop-last") {
    return evidenceRefs.slice(0, -1);
  }
  if (mode === "append-extra") {
    return [...evidenceRefs, { kind: "file", id: "invented-by-provider.ts" }];
  }
  return evidenceRefs;
}
