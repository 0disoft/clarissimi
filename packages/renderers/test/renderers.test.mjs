import assert from "node:assert/strict";
import test from "node:test";

import * as rendererExports from "../dist/index.js";
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
  renderContributorsJson,
  renderContributorsMarkdown,
  renderDraftReviewJson,
  renderRecognitionOutputs,
  renderStaticContributionsJson,
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

test("groups renamed contributor logins by stable platform identity", () => {
  const renamed = {
    platform: "github",
    id: "123456",
    login: "new-login",
    profileUrl: "https://github.com/new-login",
  };
  const records = [
    assessment(),
    assessment({
      contributor: renamed,
      source: { ...source, pullRequestNumber: 43 },
    }),
  ];
  const contributors = buildContributorsJsonDocument(records);
  const analytics = buildMaintainerRecentRecognitionShareDocument(records, {
    asOf: "2026-07-09T00:00:00.000Z",
  });

  assert.equal(contributors.contributors.length, 1);
  assert.equal(contributors.contributors[0].contributor.login, "new-login");
  assert.equal(contributors.contributors[0].contributionCount, 2);
  assert.equal(analytics.contributors.length, 1);
  assert.equal(analytics.contributors[0].contributor.login, "new-login");
  assert.equal(analytics.contributors[0].recognitionCount, 2);
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

test("encodes unsafe Markdown link destination characters without changing URL meaning", () => {
  const profileUrl = "https://github.com/octocat/profile (primary)\\notes\t\u0001";
  const evidenceUrl = "https://github.com/example/project/pull/42 (proof)\\details\n\u007f";
  const markdown = renderContributorsMarkdown(
    [
      assessment({
        contributor: {
          platform: "github",
          id: "123456",
          login: "octocat",
          profileUrl,
        },
        evidenceRefs: [
          {
            kind: "pull_request",
            id: "PR-42",
            url: evidenceUrl,
            title: "Proof",
          },
        ],
      }),
    ],
    { summary: "table" },
  );

  assert.equal(
    markdown.includes(
      "[@octocat](https://github.com/octocat/profile%20%28primary%29%5Cnotes%09%01)",
    ),
    true,
  );
  assert.equal(
    markdown.includes(
      "[Proof](https://github.com/example/project/pull/42%20%28proof%29%5Cdetails%0A%7F)",
    ),
    true,
  );
  assert.equal(markdown.includes(profileUrl), false);
  assert.equal(markdown.includes(evidenceUrl), false);
});

test("rejects URL userinfo before rendering contributor or evidence links", () => {
  assert.throws(
    () =>
      renderContributorsMarkdown(
        [
          assessment({
            contributor: {
              platform: "github",
              id: "123456",
              login: "octocat",
              profileUrl: "https://github.com@attacker.example/octocat",
            },
          }),
        ],
        { summary: "table" },
      ),
    (error) => {
      assert.equal(error instanceof RendererValidationError, true);
      assert.equal(error.issues[0].path, "$.contributor.profileUrl");
      assert.equal(error.issues[0].code, "invalid_url_userinfo");
      return true;
    },
  );

  assert.throws(
    () =>
      renderContributorsMarkdown([
        assessment({
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "https://github.com:secret@attacker.example/example/project/pull/42",
              title: "Proof",
            },
          ],
        }),
      ]),
    (error) => {
      assert.equal(error instanceof RendererValidationError, true);
      assert.equal(error.issues[0].path, "$.evidenceRefs[].url");
      assert.equal(error.issues[0].code, "invalid_url_userinfo");
      return true;
    },
  );
});

test("rejects secret-bearing query and fragment values before rendering Markdown links", () => {
  for (const url of [
    "https://github.com/octocat?access_token=secret-value",
    "https://github.com/octocat#api-key=secret-value",
  ]) {
    assert.throws(
      () =>
        renderContributorsMarkdown(
          [
            assessment({
              contributor: {
                platform: "github",
                id: "123456",
                login: "octocat",
                profileUrl: url,
              },
            }),
          ],
          { summary: "table" },
        ),
      (error) => {
        assert.equal(error instanceof RendererValidationError, true);
        assert.equal(error.issues[0].path, "$.contributor.profileUrl");
        assert.equal(error.issues[0].code, "unsafe_url_parameter");
        return true;
      },
    );
  }
});

test("keeps HTTPS validation in force for rendered Markdown links", () => {
  assert.throws(
    () =>
      renderContributorsMarkdown([
        assessment({
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "http://github.com/example/project/pull/42",
              title: "Proof",
            },
          ],
        }),
      ]),
    (error) => {
      assert.equal(error instanceof RendererValidationError, true);
      assert.equal(error.issues[0].path, "$.evidenceRefs[0].url");
      assert.equal(error.issues[0].code, "invalid_url_protocol");
      return true;
    },
  );
});

test("keeps the contributor summary table disabled by default", () => {
  const markdown = renderContributorsMarkdown([assessment()]);

  assert.equal(markdown.includes("| Contributor | Total | Types |"), false);
});

test("renders an optional contributor avatar gallery before evidence-linked details", () => {
  const markdown = renderContributorsMarkdown(
    [
      assessment(),
      assessment({
        contributor: {
          platform: "github",
          id: "456",
          login: "maintainer-helper",
          profileUrl: "https://github.com/maintainer-helper?tab=contributions&view=all",
        },
        contributionType: "security",
        source: {
          ...source,
          pullRequestNumber: 44,
        },
      }),
    ],
    { summary: "gallery" },
  );

  assert.equal(markdown.includes("## Contributor gallery"), true);
  assert.equal(
    markdown.includes(
      '<a href="https://github.com/maintainer-helper?tab=contributions&amp;view=all"><img src="https://avatars.githubusercontent.com/u/456?s=64&v=4" width="64" height="64" alt="@maintainer-helper on GitHub"></a>',
    ),
    true,
  );
  assert.equal(
    markdown.includes(
      '<a href="https://github.com/octocat"><img src="https://avatars.githubusercontent.com/u/123456?s=64&v=4" width="64" height="64" alt="@octocat on GitHub"></a>',
    ),
    true,
  );
  assert.equal(markdown.indexOf("## Contributor gallery") < markdown.indexOf("## octocat"), true);
  assert.equal(markdown.includes("Added regression coverage"), true);
  assert.equal(markdown.includes("| Contributor | Total | Types |"), false);
  assert.equal(markdown.includes("score"), false);
  assert.equal(markdown.includes("rank"), false);
});

test("keeps the contributor avatar gallery disabled by default", () => {
  const markdown = renderContributorsMarkdown([assessment()]);

  assert.equal(markdown.includes("## Contributor gallery"), false);
  assert.equal(markdown.includes("avatars.githubusercontent.com"), false);
});

test("includes approved bot and AI-agent contributors by default", () => {
  const records = [
    assessment(),
    assessment({
      contributor: {
        platform: "github",
        id: "200",
        login: "dependabot[bot]",
        profileUrl: "https://github.com/apps/dependabot",
        kind: "bot",
      },
      source: { ...source, pullRequestNumber: 43 },
    }),
    assessment({
      contributor: {
        platform: "github",
        id: "300",
        login: "review-agent",
        profileUrl: "https://github.com/review-agent",
        kind: "ai_agent",
      },
      source: { ...source, pullRequestNumber: 44 },
    }),
  ];

  const outputs = renderRecognitionOutputs(records, { summary: "gallery" });

  assert.equal(outputs.contributorsMarkdown.includes("## dependabot\\[bot\\] · Bot"), true);
  assert.equal(outputs.contributorsMarkdown.includes("## review\\-agent · AI agent"), true);
  assert.equal(outputs.contributorsJson.includes('"kind": "bot"'), true);
  assert.equal(outputs.staticDataJson.includes('"kind": "ai_agent"'), true);
});

test("opt-out hides automation contributors from derived displays but preserves the ledger", () => {
  const bot = assessment({
    contributor: {
      platform: "github",
      id: "200",
      login: "dependabot[bot]",
      profileUrl: "https://github.com/apps/dependabot",
      kind: "bot",
    },
    source: { ...source, pullRequestNumber: 43 },
  });
  const outputs = renderRecognitionOutputs([assessment(), bot], {
    summary: "gallery",
    includeAutomationContributors: false,
  });

  assert.equal(outputs.contributionsJsonl.includes("dependabot[bot]"), true);
  assert.equal(outputs.contributorsMarkdown.includes("dependabot"), false);
  assert.equal(outputs.contributorsJson.includes("dependabot"), false);
  assert.equal(outputs.staticDataJson.includes("dependabot"), false);
  assert.equal(outputs.contributorsMarkdown.includes("octocat"), true);
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

test("combined output validates once and matches individual renderer bytes", () => {
  const records = [
    assessment(),
    assessment({
      contributor: {
        platform: "github",
        id: "200",
        login: "dependabot[bot]",
        profileUrl: "https://github.com/apps/dependabot",
        kind: "bot",
      },
      source: { ...source, pullRequestNumber: 43 },
    }),
  ];
  let validationTraversals = 0;
  const observedRecords = new Proxy(records, {
    get(target, property, receiver) {
      if (property === "map") {
        validationTraversals += 1;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const options = { summary: "table", includeAutomationContributors: false };
  const combined = renderRecognitionOutputs(observedRecords, options);

  assert.equal(validationTraversals, 1);
  assert.deepEqual(combined, {
    contributionsJsonl: renderContributionsJsonl(records),
    contributorsJson: renderContributorsJson(records, options),
    contributorsMarkdown: renderContributorsMarkdown(records, options),
    staticDataJson: renderStaticContributionsJson(records, options),
  });
});

test("combined output internals stay outside the package export surface", () => {
  for (const name of [
    "buildContributorsJsonDocumentFromProfiles",
    "buildStaticContributionsDocumentFromPublicRecords",
    "deriveContributorProfilesFromPublicRecords",
    "renderContributorProfilesMarkdown",
    "renderContributorsJsonFromProfiles",
    "renderPublicContributionRecordsJsonl",
    "renderStaticContributionsJsonFromPublicRecords",
  ]) {
    assert.equal(name in rendererExports, false, `${name} must remain package-internal`);
  }
});

test("combined output preserves public validation failures", () => {
  const draft = assessment({ maintainerApprovalStatus: "draft" });
  let combinedError;
  let ledgerError;

  assert.throws(
    () => renderRecognitionOutputs([draft]),
    (error) => {
      combinedError = error;
      return error instanceof RendererValidationError;
    },
  );
  assert.throws(
    () => renderContributionsJsonl([draft]),
    (error) => {
      ledgerError = error;
      return error instanceof RendererValidationError;
    },
  );

  assert.equal(combinedError.message, ledgerError.message);
  assert.deepEqual(combinedError.issues, ledgerError.issues);
});
