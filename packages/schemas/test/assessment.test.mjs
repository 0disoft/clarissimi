import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSESSMENT_SCHEMA_VERSION,
  CONTRIBUTION_TYPES,
  CONFIG_MODES,
  CONFIG_PROVIDERS,
  hasPublicRankingLanguage,
  validateClarissimiConfig,
  validateContributionAssessment
} from "../dist/index.js";

const validAssessment = {
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
  evidenceSummary: "Added a regression test for a parser crash triggered by nested input.",
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
  maintainerApprovalStatus: "draft",
  source: {
    repository: "example/project",
    event: "merged_pull_request",
    pullRequestNumber: 42,
    mergedAt: "2026-07-08T00:00:00.000Z"
  }
};

test("accepts a valid contribution assessment draft", () => {
  const result = validateContributionAssessment(validAssessment);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("rejects unknown contribution types", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    contributionType: "points_bonus"
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "$.contributionType"), true);
});

test("rejects confidence outside the bounded range", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    confidence: 1.2
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "out_of_range"), true);
});

test("rejects public ranking language in recognition text", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    publicRecognitionText: "Rank 3 contributor with a high score."
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "public_ranking_language"), true);
});

test("rejects public ranking language in generated public narrative fields", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    affectedArea: "top 3 contributor scoreboard",
    evidenceSummary: "Earned leaderboard points for the project.",
    suggestedBadge: "Gold Contributor"
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "$.affectedArea"), true);
  assert.equal(result.issues.some((issue) => issue.path === "$.evidenceSummary"), true);
  assert.equal(result.issues.some((issue) => issue.path === "$.suggestedBadge"), true);
  assert.equal(result.issues.every((issue) => issue.code === "public_ranking_language"), true);
});

test("allows source evidence titles to mention project leaderboard features", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    evidenceRefs: [
      {
        ...validAssessment.evidenceRefs[0],
        title: "Remove broken leaderboard widget"
      }
    ]
  });

  assert.equal(result.ok, true);
});

test("rejects explicit public score fields in assessment drafts", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    score: 92,
    averageScore: 88,
    contributor: {
      ...validAssessment.contributor,
      contributorTier: "gold"
    },
    evidenceRefs: [
      {
        ...validAssessment.evidenceRefs[0],
        leaderboardPosition: 3
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "$.score"), true);
  assert.equal(result.issues.some((issue) => issue.path === "$.averageScore"), true);
  assert.equal(result.issues.some((issue) => issue.path === "$.contributor.contributorTier"), true);
  assert.equal(result.issues.some((issue) => issue.path === "$.evidenceRefs[0].leaderboardPosition"), true);
  assert.equal(result.issues.every((issue) => issue.code === "public_score_field"), true);
});

test("exports the product contribution type vocabulary", () => {
  assert.equal(CONTRIBUTION_TYPES.includes("release_validation"), true);
  assert.equal(CONTRIBUTION_TYPES.includes("leaderboard_points"), false);
});

test("detects ranking language independently", () => {
  assert.equal(hasPublicRankingLanguage("Top 3 contributor on the leaderboard"), true);
  assert.equal(hasPublicRankingLanguage("Average score improved to 92."), true);
  assert.equal(hasPublicRankingLanguage("Earned leaderboard points for this contribution."), true);
  assert.equal(hasPublicRankingLanguage("Promoted to gold contributor tier."), true);
  assert.equal(hasPublicRankingLanguage("AI judged this contributor as medium quality."), true);
  assert.equal(hasPublicRankingLanguage("Added regression coverage for the parser crash"), false);
  assert.equal(hasPublicRankingLanguage("Clarified three setup points in the documentation."), false);
});

test("accepts supported Clarissimi config values", () => {
  const result = validateClarissimiConfig({
    provider: "openai-compatible",
    providerModel: "example-model",
    providerEndpoint: "https://example.com/v1/chat/completions",
    providerThinking: "disabled",
    mode: "dry-run"
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.provider, "openai-compatible");
});

test("rejects unsupported Clarissimi config values", () => {
  const result = validateClarissimiConfig({
    provider: "leaderboard-provider"
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "$.provider"), true);
});

test("exports Clarissimi config vocabulary", () => {
  assert.equal(CONFIG_PROVIDERS.includes("openai-compatible"), true);
  assert.equal(CONFIG_PROVIDERS.includes("ranking-model"), false);
  assert.equal(CONFIG_MODES.includes("propose"), true);
});
