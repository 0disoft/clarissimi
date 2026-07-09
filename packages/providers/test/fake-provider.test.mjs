import assert from "node:assert/strict";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import { validateContributionAssessment } from "@clarissimi/schemas";

import {
  FakeProviderAssessmentError,
  createFakeAssessment,
  createFakeContributionDraftProvider
} from "../dist/index.js";

const contributor = {
  platform: "github",
  id: "123456",
  login: "octocat",
  profileUrl: "https://github.com/octocat"
};

const source = {
  repository: "example/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z"
};

function preparedEvidence(items) {
  return prepareEvidenceForProvider({
    source,
    items
  });
}

test("creates a deterministic draft assessment from prepared evidence", async () => {
  const provider = createFakeContributionDraftProvider();
  const evidence = preparedEvidence([
    {
      kind: "test",
      id: "tests/parser.test.ts",
      title: "parser regression coverage",
      text: "Added a regression case for nested parser input."
    }
  ]);

  const assessment = await provider.createAssessment({
    contributor,
    preparedEvidence: evidence
  });

  assert.equal(provider.id, "fake-deterministic");
  assert.equal(assessment.schemaVersion, "clarissimi.assessment/v1");
  assert.equal(assessment.contributionType, "test");
  assert.equal(assessment.impactLevel, "medium");
  assert.equal(assessment.maintainerApprovalStatus, "draft");
  assert.deepEqual(assessment.evidenceRefs, evidence.evidenceRefs);
  assert.equal(validateContributionAssessment(assessment).ok, true);
});

test("honors safe maintainer hints without changing source or evidence refs", () => {
  const evidence = preparedEvidence([
    {
      kind: "pull_request",
      id: "PR-7",
      title: "release validation notes"
    }
  ]);

  const assessment = createFakeAssessment({
    contributor,
    preparedEvidence: evidence,
    hints: {
      contributionType: "release_validation",
      affectedArea: "release checklist",
      impactLevel: "high",
      suggestedBadge: "Release Verifier",
      confidence: 0.91
    }
  });

  assert.equal(assessment.contributionType, "release_validation");
  assert.equal(assessment.affectedArea, "release checklist");
  assert.equal(assessment.impactLevel, "high");
  assert.equal(assessment.suggestedBadge, "Release Verifier");
  assert.equal(assessment.confidence, 0.91);
  assert.deepEqual(assessment.source, source);
  assert.deepEqual(assessment.evidenceRefs, evidence.evidenceRefs);
});

test("keeps ranking language out of generated public narrative fields", () => {
  const evidence = preparedEvidence([
    {
      kind: "file",
      id: "src/maintenance.ts",
      title: "repository maintenance"
    }
  ]);

  const assessment = createFakeAssessment({
    contributor,
    preparedEvidence: evidence,
    hints: {
      affectedArea: "top 3 contributor scoreboard",
      suggestedBadge: "Gold Contributor"
    }
  });

  assert.equal(assessment.affectedArea, "repository maintenance");
  assert.equal(assessment.suggestedBadge, "Maintenance Steward");
  assert.equal(assessment.evidenceSummary.includes("top 3 contributor scoreboard"), false);
  assert.equal(assessment.publicRecognitionText.includes("top 3 contributor scoreboard"), false);
  assert.equal(validateContributionAssessment(assessment).ok, true);
});

test("throws when prepared evidence cannot satisfy the schema", () => {
  const evidence = prepareEvidenceForProvider({
    source,
    items: []
  });

  assert.throws(
    () =>
      createFakeAssessment({
        contributor,
        preparedEvidence: evidence
      }),
    FakeProviderAssessmentError
  );
});
