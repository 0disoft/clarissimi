import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSESSMENT_SCHEMA_VERSION,
  CONTRIBUTION_TYPES,
  CONFIG_MODES,
  CONFIG_MARKDOWN_SUMMARIES,
  CONFIG_PROVIDERS,
  hasPublicRankingLanguage,
  validateClarissimiConfig,
  validateContributionAssessment,
} from "../dist/index.js";

const validAssessment = {
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
  evidenceSummary: "Added a regression test for a parser crash triggered by nested input.",
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
  maintainerApprovalStatus: "draft",
  source: {
    repository: "example/project",
    event: "merged_pull_request",
    pullRequestNumber: 42,
    mergedAt: "2026-07-08T00:00:00.000Z",
  },
};

test("accepts a valid contribution assessment draft", () => {
  const result = validateContributionAssessment(validAssessment);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("rejects unknown contribution types", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    contributionType: "points_bonus",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.contributionType"),
    true,
  );
});

test("rejects confidence outside the bounded range", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    confidence: 1.2,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === "out_of_range"),
    true,
  );
});

test("rejects public ranking language in recognition text", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    publicRecognitionText: "Rank 3 contributor with a high score.",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === "public_ranking_language"),
    true,
  );
});

test("rejects public contribution share language in recognition text", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    affectedArea: "최근 3개월간 전체 기여점수 비율 37%",
    evidenceSummary: "This person contributed 37% of the last 90 days contribution score.",
    publicRecognitionText: "Held a 22 percent share of the last 3 months contribution weight.",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.affectedArea"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.evidenceSummary"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.publicRecognitionText"),
    true,
  );
  assert.equal(
    result.issues.every((issue) => issue.code === "public_ranking_language"),
    true,
  );
});

test("rejects public ranking language in generated public narrative fields", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    affectedArea: "top 3 contributor scoreboard",
    evidenceSummary: "Earned leaderboard points for the project.",
    suggestedBadge: "Gold Contributor",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.affectedArea"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.evidenceSummary"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.suggestedBadge"),
    true,
  );
  assert.equal(
    result.issues.every((issue) => issue.code === "public_ranking_language"),
    true,
  );
});

test("allows source evidence titles to mention project leaderboard features", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    evidenceRefs: [
      {
        ...validAssessment.evidenceRefs[0],
        title: "Remove broken leaderboard widget",
      },
    ],
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
      contributorTier: "gold",
    },
    evidenceRefs: [
      {
        ...validAssessment.evidenceRefs[0],
        leaderboardPosition: 3,
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.score"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.averageScore"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.contributor.contributorTier"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.evidenceRefs[0].leaderboardPosition"),
    true,
  );
  assert.equal(
    result.issues.every((issue) => issue.code === "public_score_field"),
    true,
  );
});

test("rejects public score fields across common field-name variants", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    total_score: 92,
    "average-score": 88,
    LeaderboardPosition: 3,
    contributor: {
      ...validAssessment.contributor,
      contributor_tier: "gold",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.total_score"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.average-score"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.LeaderboardPosition"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.contributor.contributor_tier"),
    true,
  );
  assert.equal(
    result.issues.every((issue) => issue.code === "public_score_field"),
    true,
  );
});

test("rejects public contribution share fields across common field-name variants", () => {
  const result = validateContributionAssessment({
    ...validAssessment,
    scoreShare: 0.37,
    "impact-weight-share": 0.22,
    recentContributionWeightShare: 0.18,
    last90DaysScoreShare: 0.3,
    threeMonthContributionShare: 0.27,
    recentImpactWeightPercent: 0.19,
    contributor: {
      ...validAssessment.contributor,
      point_share: 0.4,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.scoreShare"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.impact-weight-share"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.recentContributionWeightShare"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.last90DaysScoreShare"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.threeMonthContributionShare"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.recentImpactWeightPercent"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.contributor.point_share"),
    true,
  );
  assert.equal(
    result.issues.every((issue) => issue.code === "public_score_field"),
    true,
  );
});

test("exports the product contribution type vocabulary", () => {
  assert.equal(CONTRIBUTION_TYPES.includes("release_validation"), true);
  assert.equal(CONTRIBUTION_TYPES.includes("leaderboard_points"), false);
});

test("detects ranking language independently", () => {
  assert.equal(hasPublicRankingLanguage("Top 3 contributor on the leaderboard"), true);
  assert.equal(hasPublicRankingLanguage("Average score improved to 92."), true);
  assert.equal(
    hasPublicRankingLanguage("This person contributed 37% of the last 90 days contribution score."),
    true,
  );
  assert.equal(
    hasPublicRankingLanguage("Held a 22 percent share of the last 3 months contribution weight."),
    true,
  );
  assert.equal(hasPublicRankingLanguage("최근 3개월간 전체 기여점수 비율 37%"), true);
  assert.equal(hasPublicRankingLanguage("Show score share for this contributor."), true);
  assert.equal(hasPublicRankingLanguage("Earned leaderboard points for this contribution."), true);
  assert.equal(hasPublicRankingLanguage("Promoted to gold contributor tier."), true);
  assert.equal(hasPublicRankingLanguage("AI judged this contributor as medium quality."), true);
  assert.equal(hasPublicRankingLanguage("Added regression coverage for the parser crash"), false);
  assert.equal(
    hasPublicRankingLanguage("Clarified three setup points in the documentation."),
    false,
  );
});

test("accepts supported Clarissimi config values", () => {
  const result = validateClarissimiConfig({
    provider: "openai-compatible",
    providerModel: "example-model",
    providerEndpoint: "https://example.com/v1/chat/completions",
    providerEndpointTrust: "private-network",
    providerThinking: "disabled",
    mode: "dry-run",
    markdownSummary: "table",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.provider, "openai-compatible");
  assert.equal(result.value.providerEndpointTrust, "private-network");
  assert.equal(result.value.markdownSummary, "table");
});

test("rejects unsupported provider endpoint config values", () => {
  const invalidUrl = validateClarissimiConfig({
    providerEndpoint: "not a url",
  });
  assert.equal(invalidUrl.ok, false);
  assert.equal(
    invalidUrl.issues.some((issue) => issue.code === "invalid_url"),
    true,
  );

  const unsupportedProtocol = validateClarissimiConfig({
    providerEndpoint: "file:///tmp/provider.sock",
  });
  assert.equal(unsupportedProtocol.ok, false);
  assert.equal(
    unsupportedProtocol.issues.some((issue) => issue.code === "invalid_url_protocol"),
    true,
  );
});

test("rejects unsupported Clarissimi config values", () => {
  const result = validateClarissimiConfig({
    provider: "leaderboard-provider",
    providerEndpointTrust: "unrestricted",
    markdownSummary: "leaderboard",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "$.providerEndpointTrust"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.provider"),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.path === "$.markdownSummary"),
    true,
  );
});

test("exports Clarissimi config vocabulary", () => {
  assert.equal(CONFIG_PROVIDERS.includes("openai-compatible"), true);
  assert.equal(CONFIG_PROVIDERS.includes("ranking-model"), false);
  assert.equal(CONFIG_MODES.includes("propose"), true);
  assert.deepEqual(CONFIG_MARKDOWN_SUMMARIES, ["none", "table"]);
});
