import assert from "node:assert/strict";
import test from "node:test";

import {
  EvidencePreparationError,
  PROVIDER_EVIDENCE_LIMITS,
  canPublishAssessment,
  createDraftApprovalSnapshot,
  findUnsafeRepositoryAssessmentFields,
  matchesDraftApprovalSnapshot,
  prepareEvidenceForProvider,
} from "../dist/index.js";
import { ASSESSMENT_SCHEMA_VERSION, REDACTION_PLACEHOLDER } from "./support.mjs";

const source = {
  repository: "example/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z",
};

function validAssessment(status = "approved") {
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat",
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
        title: "Add parser regression coverage",
      },
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
    maintainerApprovalStatus: status,
    source,
  };
}

test("approval snapshot binds the draft content independently of JSON key order", () => {
  const draft = validAssessment("draft");
  const snapshot = createDraftApprovalSnapshot(draft, "2026-09-29T00:00:00.000Z");
  const approved = {
    ...draft,
    maintainerApprovalStatus: "approved",
    approvalSnapshot: snapshot,
  };
  assert.match(snapshot.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal(matchesDraftApprovalSnapshot(approved), true);
  assert.equal(
    matchesDraftApprovalSnapshot(Object.fromEntries(Object.entries(approved).reverse())),
    true,
  );
  assert.equal(
    matchesDraftApprovalSnapshot({
      ...approved,
      publicRecognitionText: "A different recognition after approval.",
    }),
    false,
  );
});

test("repository safety rejects visible secrets without putting values in diagnostics", () => {
  const syntheticToken = `ghp_${"a".repeat(20)}`;
  const assessment = validAssessment();
  const issues = findUnsafeRepositoryAssessmentFields({
    ...assessment,
    affectedArea: "See https://example.invalid/docs?access%5Ftoken=short",
    publicRecognitionText: `Recognized with ${syntheticToken}.`,
    evidenceRefs: [
      {
        ...assessment.evidenceRefs[0],
        url: "https://github.com/example/project/pull/42?access%5Ftoken=encoded-value",
      },
    ],
  });

  assert.deepEqual(
    issues.map(({ path, code }) => ({ path, code })),
    [
      { path: "$.affectedArea", code: "unsafe_url_parameter" },
      { path: "$.publicRecognitionText", code: "unsafe_repository_text" },
      { path: "$.evidenceRefs[].url", code: "unsafe_url_parameter" },
    ],
  );
  assert.equal(JSON.stringify(issues).includes(syntheticToken), false);
  const fragmentIssues = findUnsafeRepositoryAssessmentFields({
    ...assessment,
    contributor: {
      ...assessment.contributor,
      profileUrl: "https://github.com/octocat#/profile?access_token=short",
    },
  });
  assert.deepEqual(
    fragmentIssues.map(({ path, code }) => ({ path, code })),
    [{ path: "$.contributor.profileUrl", code: "unsafe_url_parameter" }],
  );
  assert.deepEqual(findUnsafeRepositoryAssessmentFields(assessment), []);
});

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
          authorEmail: address,
        },
      },
    ],
  });

  assert.equal(prepared.redactionReport.changed, true);
  assert.equal(prepared.items[0].title, `Reported by ${REDACTION_PLACEHOLDER}`);
  assert.equal(prepared.items[0].excerpt, REDACTION_PLACEHOLDER);
  assert.deepEqual(prepared.items[0].metadata, {
    authorEmail: REDACTION_PLACEHOLDER,
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
        text: "Added regression coverage for nested input.",
      },
    ],
  });

  assert.deepEqual(prepared.source, source);
  assert.equal(prepared.items[0].kind, "test");
  assert.equal(prepared.items[0].id, "tests/parser.test.ts");
  assert.equal(prepared.redactionReport.changed, false);
});

test("rejects prepared evidence above the item budget", () => {
  assert.throws(
    () =>
      prepareEvidenceForProvider({
        source,
        items: Array.from({ length: PROVIDER_EVIDENCE_LIMITS.maxItems + 1 }, (_, index) => ({
          kind: "file",
          id: `src/file-${index}.ts`,
        })),
      }),
    (error) => error instanceof EvidencePreparationError && error.code === "evidence_item_limit",
  );
});

test("rejects prepared evidence above the aggregate UTF-8 byte budget", () => {
  assert.throws(
    () =>
      prepareEvidenceForProvider({
        source,
        items: [
          {
            kind: "file",
            id: "src/large.ts",
            metadata: { content: "x".repeat(PROVIDER_EVIDENCE_LIMITS.maxUtf8Bytes) },
          },
        ],
      }),
    (error) => error instanceof EvidencePreparationError && error.code === "evidence_bytes_limit",
  );
});

test("fails closed when evidence identity fields contain secret-bearing assignments", () => {
  for (const item of [
    { kind: "file", id: '"API_KEY=synthetic-secret-value"' },
    {
      kind: "file",
      id: "src/safe.ts",
      url: "https://example.invalid/evidence?token=synthetic-secret-value",
    },
  ]) {
    assert.throws(
      () => prepareEvidenceForProvider({ source, items: [item] }),
      (error) =>
        error instanceof EvidencePreparationError && error.code === "unsafe_structural_field",
    );
  }
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
    confidence: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === "out_of_range"),
    true,
  );
});
