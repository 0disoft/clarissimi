import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRIBUTIONS_JSONL_PATH,
  RENDERED_OUTPUT_PATHS,
  RendererValidationError,
  appendPublicContributionRecord,
  buildContributorsJsonDocument,
  buildMaintainerRecentRecognitionShareDocument,
  buildStaticContributionsDocument,
  draftReviewPathForAssessment,
  parseContributionsJsonl,
  renderContributionsJsonl,
  renderContributorsMarkdown,
  renderDraftReviewJson,
  renderRecognitionOutputs,
} from "../dist/index.js";

const source = {
  repository: "example/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z",
};

function assessment(overrides = {}) {
  return {
    schemaVersion: "clarissimi.assessment/v1",
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
    maintainerApprovalStatus: "approved",
    source,
    ...overrides,
  };
}

test("renders approved assessments as parseable JSONL", () => {
  const jsonl = renderContributionsJsonl([assessment()]);
  const parsed = parseContributionsJsonl(jsonl);

  assert.equal(jsonl.endsWith("\n"), true);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].publicRecognitionText, "Added regression coverage for the parser crash.");
});

test("keeps approved ledger output on the MVP single-file path", () => {
  assert.equal(CONTRIBUTIONS_JSONL_PATH, ".clarissimi/contributions.jsonl");
  assert.equal(RENDERED_OUTPUT_PATHS.contributionsJsonl, CONTRIBUTIONS_JSONL_PATH);
  assert.equal(
    Object.values(RENDERED_OUTPUT_PATHS).includes(".clarissimi/contributions/2026.jsonl"),
    false,
  );
});

test("renders only public contribution record fields", () => {
  const jsonl = renderContributionsJsonl([
    assessment({
      evidenceRefs: [
        {
          kind: "pull_request",
          id: "PR-42",
          url: "https://github.com/example/project/pull/42",
          title: "Add parser regression coverage",
          excerpt: "PATCH_EXCERPT_SENTINEL",
        },
      ],
      rawProviderOutput: "PROVIDER_RAW_SENTINEL",
      rawEvidence: "RAW_EVIDENCE_SENTINEL",
    }),
  ]);
  const parsed = parseContributionsJsonl(jsonl);

  assert.equal(jsonl.includes("PATCH_EXCERPT_SENTINEL"), false);
  assert.equal(jsonl.includes("PROVIDER_RAW_SENTINEL"), false);
  assert.equal(jsonl.includes("RAW_EVIDENCE_SENTINEL"), false);
  assert.equal(parsed[0].evidenceRefs[0].excerpt, undefined);
});

test("renders empty JSONL as an empty file", () => {
  assert.equal(renderContributionsJsonl([]), "");
  assert.deepEqual(parseContributionsJsonl(""), []);
});

test("appends a contribution without replacing existing ledger records", () => {
  const existing = assessment({
    contributor: {
      platform: "github",
      id: "654321",
      login: "hubot",
      profileUrl: "https://github.com/hubot",
    },
    source: {
      ...source,
      pullRequestNumber: 41,
    },
  });
  const records = appendPublicContributionRecord([existing], assessment());

  assert.equal(records.length, 2);
  assert.equal(records[0].contributor.login, "hubot");
  assert.equal(records[1].contributor.login, "octocat");
});

test("rejects duplicate contribution identity while appending", () => {
  assert.throws(
    () => appendPublicContributionRecord([assessment()], assessment()),
    (error) => {
      assert.equal(error instanceof RendererValidationError, true);
      assert.equal(error.issues[0].code, "duplicate_source");
      return true;
    },
  );
});

test("rejects duplicate identities already present in a ledger before appending", () => {
  assert.throws(
    () =>
      appendPublicContributionRecord(
        [assessment(), assessment()],
        assessment({ source: { ...source, pullRequestNumber: 43 } }),
      ),
    (error) => {
      assert.equal(error instanceof RendererValidationError, true);
      assert.equal(error.message, "Ledger contains duplicate contribution records.");
      return true;
    },
  );
});

test("rejects draft assessments before rendering public outputs", () => {
  assert.throws(
    () => renderContributionsJsonl([assessment({ maintainerApprovalStatus: "draft" })]),
    RendererValidationError,
  );
});

test("renders sanitized draft review JSON for inbox staging", () => {
  const draft = assessment({
    maintainerApprovalStatus: "draft",
    evidenceRefs: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: "Add parser regression coverage",
        excerpt: "PATCH_EXCERPT_SENTINEL",
      },
    ],
    rawProviderOutput: "PROVIDER_RAW_SENTINEL",
    rawEvidence: "RAW_EVIDENCE_SENTINEL",
  });
  const rendered = renderDraftReviewJson(draft);
  const parsed = JSON.parse(rendered);

  assert.equal(parsed.maintainerApprovalStatus, "draft");
  assert.equal(parsed.evidenceRefs[0].excerpt, undefined);
  assert.equal(rendered.includes("PATCH_EXCERPT_SENTINEL"), false);
  assert.equal(rendered.includes("PROVIDER_RAW_SENTINEL"), false);
  assert.equal(rendered.includes("RAW_EVIDENCE_SENTINEL"), false);
  assert.equal(
    draftReviewPathForAssessment(draft),
    ".clarissimi/drafts/example-project-merged_pull_request-42.json",
  );
});

test("rejects approved assessments before rendering draft review JSON", () => {
  assert.throws(() => renderDraftReviewJson(assessment()), RendererValidationError);
});

test("derives contributor profiles without public ranking fields", () => {
  const document = buildContributorsJsonDocument([
    assessment(),
    assessment({
      source: {
        ...source,
        pullRequestNumber: 43,
      },
      contributionType: "documentation",
      affectedArea: "setup guide",
      suggestedBadge: "Docs Pathfinder",
      publicRecognitionText: "Improved setup documentation for first-time contributors.",
    }),
  ]);

  assert.equal(document.schemaVersion, "clarissimi.contributors/v1");
  assert.equal(document.contributors.length, 1);
  assert.equal(document.contributors[0].contributionCount, 2);
  assert.deepEqual(document.contributors[0].contributionTypes, ["documentation", "test"]);
  assert.equal(JSON.stringify(document).includes("score"), false);
  assert.equal(JSON.stringify(document).includes("rank"), false);
});

test("derived public profile and static data omit score-share ingredients", () => {
  const contributorDocument = buildContributorsJsonDocument([assessment()]);
  const staticDocument = buildStaticContributionsDocument([assessment()]);
  const publicText = JSON.stringify({
    contributorDocument,
    staticDocument,
  });

  assert.equal(publicText.includes("confidence"), false);
  assert.equal(publicText.includes("impactLevel"), false);
  assert.equal(publicText.includes("evidenceSummary"), false);
  assert.equal(publicText.includes("internalImpactWeight"), false);
  assert.equal(publicText.includes("scoreShare"), false);
  assert.equal(publicText.includes("contributionWeightShare"), false);
  assert.equal(publicText.includes("impactWeightShare"), false);
  assert.equal(publicText.includes("percent"), false);
});

test("builds maintainer-only recent recognition share analytics", () => {
  const contributor = {
    platform: "github",
    id: "456",
    login: "maintainer-helper",
    profileUrl: "https://github.com/maintainer-helper",
  };
  const document = buildMaintainerRecentRecognitionShareDocument(
    [
      assessment({
        impactLevel: "high",
        source: {
          ...source,
          pullRequestNumber: 40,
          mergedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
      assessment({
        impactLevel: "medium",
        contributionType: "documentation",
        affectedArea: "setup guide",
        source: {
          ...source,
          pullRequestNumber: 41,
          mergedAt: "2026-05-01T00:00:00.000Z",
        },
      }),
      assessment({
        contributor,
        impactLevel: "low",
        source: {
          ...source,
          pullRequestNumber: 44,
          mergedAt: "2026-06-15T00:00:00.000Z",
        },
      }),
      assessment({
        contributor,
        source: {
          ...source,
          pullRequestNumber: 45,
          mergedAt: "2026-02-01T00:00:00.000Z",
        },
      }),
      assessment({
        source: {
          repository: source.repository,
          event: source.event,
          pullRequestNumber: 46,
        },
      }),
    ],
    {
      asOf: "2026-07-09T00:00:00.000Z",
      windowDays: 90,
    },
  );

  assert.equal(document.schemaVersion, "clarissimi.maintainer-analytics/v1");
  assert.equal(document.scope, "maintainer-only");
  assert.equal(document.window.includedRecords, 3);
  assert.equal(document.window.excludedRecordsWithoutMergedAt, 1);
  assert.equal(document.window.totalRecognitionWeight, 6);
  assert.equal(document.contributors.length, 2);
  assert.equal(document.contributors[0].contributor.login, "octocat");
  assert.equal(document.contributors[0].recognitionCount, 2);
  assert.equal(document.contributors[0].recognitionWeight, 5);
  assert.equal(document.contributors[0].recognitionShare, 0.833333);
  assert.deepEqual(document.contributors[0].contributionTypes, ["documentation", "test"]);
  assert.equal(document.contributors[1].contributor.login, "maintainer-helper");
  assert.equal(document.contributors[1].recognitionShare, 0.166667);
  assert.equal(JSON.stringify(document).includes("rank"), false);
  assert.equal(JSON.stringify(document).includes("score"), false);
});

test("renders idempotent contributors markdown", () => {
  const first = renderContributorsMarkdown([assessment()]);
  const second = renderContributorsMarkdown(
    parseContributionsJsonl(renderContributionsJsonl([assessment()])),
  );

  assert.equal(first, second);
  assert.equal(first.includes("# Contributors"), true);
  assert.equal(first.includes("## octocat"), true);
  assert.equal(first.includes("**1 recognized contribution** · test 1"), true);
  assert.equal(first.includes("leaderboard"), false);
});

test("renders per-contributor totals and deterministic type counts without scores", () => {
  const markdown = renderContributorsMarkdown([
    assessment(),
    assessment({
      source: {
        ...source,
        pullRequestNumber: 43,
      },
    }),
    assessment({
      contributionType: "documentation",
      affectedArea: "setup guide",
      suggestedBadge: "Docs Pathfinder",
      publicRecognitionText: "Improved setup documentation for first-time contributors.",
      source: {
        ...source,
        pullRequestNumber: 44,
      },
    }),
    assessment({
      contributor: {
        platform: "github",
        id: "456",
        login: "maintainer-helper",
        profileUrl: "https://github.com/maintainer-helper",
      },
      contributionType: "security",
      affectedArea: "token handling",
      suggestedBadge: "Security Steward",
      publicRecognitionText: "Hardened token handling at the provider boundary.",
      source: {
        ...source,
        pullRequestNumber: 45,
      },
    }),
  ]);

  assert.equal(
    markdown.includes("## maintainer\\-helper\n\n**1 recognized contribution** · security 1"),
    true,
  );
  assert.equal(
    markdown.includes("## octocat\n\n**3 recognized contributions** · documentation 1 · test 2"),
    true,
  );
  assert.equal(markdown.includes("score"), false);
  assert.equal(markdown.includes("rank"), false);
  assert.equal(markdown.includes("%"), false);
});

test("renders an optional contributor summary table before the detailed sections", () => {
  const markdown = renderContributorsMarkdown(
    [
      assessment(),
      assessment({
        contributionType: "documentation",
        source: {
          ...source,
          pullRequestNumber: 43,
        },
      }),
      assessment({
        contributor: {
          platform: "github",
          id: "456",
          login: "maintainer-helper",
          profileUrl: "https://github.com/maintainer-helper",
        },
        contributionType: "security",
        source: {
          ...source,
          pullRequestNumber: 44,
        },
      }),
    ],
    { summary: "table" },
  );

  assert.equal(markdown.includes("| Contributor | Total | Types |\n| --- | ---: | --- |"), true);
  assert.equal(
    markdown.includes(
      "| [@maintainer\\-helper](https://github.com/maintainer-helper) | 1 | security 1 |",
    ),
    true,
  );
  assert.equal(
    markdown.includes("| [@octocat](https://github.com/octocat) | 2 | documentation 1 · test 1 |"),
    true,
  );
  assert.equal(markdown.indexOf("| Contributor |"), markdown.lastIndexOf("| Contributor |"));
  assert.equal(
    markdown.indexOf("| Contributor |") < markdown.indexOf("## maintainer\\-helper"),
    true,
  );
  assert.equal(markdown.includes("## octocat"), true);
  assert.equal(markdown.includes("score"), false);
  assert.equal(markdown.includes("rank"), false);
  assert.equal(markdown.includes("%"), false);
});

test("keeps the contributor summary table disabled by default", () => {
  const markdown = renderContributorsMarkdown([assessment()]);

  assert.equal(markdown.includes("| Contributor | Total | Types |"), false);
});

test("builds static data from the same public records", () => {
  const document = buildStaticContributionsDocument([assessment()]);

  assert.equal(document.schemaVersion, "clarissimi.static-contributions/v1");
  assert.equal(document.contributions.length, 1);
  assert.equal(document.contributors.length, 1);
});

test("renders all repository output targets consistently", () => {
  const outputs = renderRecognitionOutputs([assessment()], {
    summary: "table",
  });

  assert.equal(outputs.contributionsJsonl.includes("clarissimi.assessment/v1"), true);
  assert.equal(outputs.contributorsJson.includes("clarissimi.contributors/v1"), true);
  assert.equal(outputs.contributorsMarkdown.includes("Added regression coverage"), true);
  assert.equal(outputs.contributorsMarkdown.includes("| Contributor | Total | Types |"), true);
  assert.equal(outputs.staticDataJson.includes("clarissimi.static-contributions/v1"), true);
});
