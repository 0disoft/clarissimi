import assert from "node:assert/strict";
import test from "node:test";

import {
  canPublishAssessment,
  prepareEvidenceForProvider
} from "../dist/index.js";
import { ASSESSMENT_SCHEMA_VERSION, REDACTION_PLACEHOLDER } from "./support.mjs";

const source = {
  repository: "example/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z"
};

function validAssessment(status = "approved") {
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat"
    },
    contributionType: "test",
    affectedArea: "parser regression coverage",
    impactLevel: "medium",
    evidenceSummary: "Added a regression test for a parser crash.",
    evidenceRefs: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: "Add parser regression coverage"
      }
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
    maintainerApprovalStatus: status,
    source
  };
}

test("prepares provider evidence by redacting all text-bearing fields", () => {
  const address = `contributor@${["example", "invalid"].join(".")}`;
  const keyName = ["OPENAI", "API", "KEY"].join("_");
  const prepared = prepareEvidenceForProvider({
    source,
    items: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: `Reported by ${address}`,
        excerpt: `${keyName}=synthetic-value`,
        metadata: {
          authorEmail: address
        }
      }
    ]
  });

  assert.equal(prepared.redactionReport.changed, true);
  assert.equal(prepared.items[0].title, `Reported by ${REDACTION_PLACEHOLDER}`);
  assert.equal(prepared.items[0].excerpt, REDACTION_PLACEHOLDER);
  assert.deepEqual(prepared.items[0].metadata, {
    authorEmail: REDACTION_PLACEHOLDER
  });
  assert.equal(prepared.evidenceRefs[0].title, `Reported by ${REDACTION_PLACEHOLDER}`);
  assert.equal(prepared.evidenceRefs[0].excerpt, REDACTION_PLACEHOLDER);
});

test("keeps provider evidence source and item identity intact", () => {
  const prepared = prepareEvidenceForProvider({
    source,
    items: [
      {
        kind: "test",
        id: "tests/parser.test.ts",
        title: "Parser regression test",
        text: "Added regression coverage for nested input."
      }
    ]
  });

  assert.deepEqual(prepared.source, source);
  assert.equal(prepared.items[0].kind, "test");
  assert.equal(prepared.items[0].id, "tests/parser.test.ts");
  assert.equal(prepared.redactionReport.changed, false);
});

test("allows approved assessments to become public records", () => {
  const result = canPublishAssessment(validAssessment("approved"));

  assert.equal(result.ok, true);
  assert.equal(result.value.assessment.maintainerApprovalStatus, "approved");
});

test("allows explicitly auto-approved assessments to become public records", () => {
  const result = canPublishAssessment(validAssessment("auto_approved"));

  assert.equal(result.ok, true);
  assert.equal(result.value.assessment.maintainerApprovalStatus, "auto_approved");
});

test("rejects draft assessments from public publication", () => {
  const result = canPublishAssessment(validAssessment("draft"));

  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "not_approved");
});

test("rejects structurally invalid assessments before approval checks", () => {
  const result = canPublishAssessment({
    ...validAssessment("approved"),
    confidence: 2
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "out_of_range"), true);
});
