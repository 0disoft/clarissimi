import assert from "node:assert/strict";
import test from "node:test";

import { RendererValidationError, renderContributorPage } from "../dist/index.js";

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

test("renders one self-contained contributor page with evidence and security policy", () => {
  const page = renderContributorPage([assessment()]);

  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<title>example\/project contributors<\/title>/);
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /default-src 'none'/);
  assert.match(page, /https:\/\/avatars\.githubusercontent\.com\/u\/123456\?s=96&amp;v=4/);
  assert.match(page, /Added regression coverage for the parser crash\./);
  assert.match(page, /href="https:\/\/github\.com\/example\/project\/pull\/42"/);
  assert.equal(page.includes("<script"), false);
  assert.equal(page.includes("leaderboard"), false);
});

test("includes automation contributors by default and supports display-only exclusion", () => {
  const bot = assessment({
    contributor: {
      platform: "github",
      id: "200",
      login: "dependabot[bot]",
      profileUrl: "https://github.com/apps/dependabot",
      kind: "bot",
    },
  });

  assert.match(renderContributorPage([bot]), /dependabot\[bot\]/);
  assert.match(renderContributorPage([bot]), /<span class="kind">Bot<\/span>/);
  assert.equal(
    renderContributorPage([bot], { includeAutomationContributors: false }).includes("dependabot"),
    false,
  );
});

test("escapes contributor content and rejects secret-bearing links", () => {
  const escaped = renderContributorPage([
    assessment({
      contributor: {
        platform: "github",
        id: "123456",
        login: '<octo & "cat">',
        profileUrl: "https://github.com/%3Cocto%20%26%20%22cat%22%3E",
      },
    }),
  ]);

  assert.match(escaped, /&lt;octo &amp; &quot;cat&quot;&gt;/);
  assert.equal(escaped.includes('<octo & "cat">'), false);
  assert.throws(
    () =>
      renderContributorPage([
        assessment({
          contributor: {
            platform: "github",
            id: "123456",
            login: "octocat",
            profileUrl: "https://github.com/octocat?access_token=secret",
          },
        }),
      ]),
    (error) => {
      assert.equal(error instanceof RendererValidationError, true);
      assert.equal(error.issues[0].code, "invalid_github_profile_url");
      return true;
    },
  );
});

test("renders an accessible empty state for an empty ledger", () => {
  const page = renderContributorPage([]);

  assert.match(page, /aria-label="Recognized contributors"/);
  assert.match(page, /No approved recognition records yet\./);
});
