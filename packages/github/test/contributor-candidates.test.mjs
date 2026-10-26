import assert from "node:assert/strict";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";

import { collectLiveMergedPullRequestEvidence, createGitHubApiClient } from "../dist/index.js";

const author = { id: 1, login: "author" };
const reviewer = { id: 2, login: "reviewer" };
const reporter = { id: 3, login: "reporter" };
const marker = "PRIVATE" + " KEY";
const material = "synthetic-key-material";
const block = `-----BEGIN ${marker}-----\n${(material + "\n").repeat(180)}-----END ${marker}-----`;

function client(overrides = {}) {
  return {
    getPullRequest: async () => ({
      number: 42,
      title: "Fix parser",
      body: "Closes #7 and #8.",
      htmlUrl: "https://github.com/sample/project/pull/42",
      mergedAt: "2026-07-08T00:00:00.000Z",
      user: author,
    }),
    listPullRequestFiles: async () => [{ filename: "src/parser.ts" }],
    listPullRequestReviewComments: async () => [
      { id: 91, body: "Please cover this input.", user: { ...reviewer, login: "previous-login" } },
      { id: 92, body: "Covered.", user: author },
      { id: 93, body: "Deleted account.", user: null },
    ],
    listPullRequestReviews: async () => [
      { id: 101, state: "APPROVED", user: reviewer, body: block },
      { id: 102, state: "COMMENTED", user: reporter },
      { id: 103, state: "PENDING", user: { id: 4, login: "pending-reviewer" } },
      { id: 104, state: "DISMISSED", user: null },
    ],
    getIssue: async ({ issueNumber }) => ({
      number: issueNumber,
      title: "Parser report",
      body: block,
      htmlUrl: `https://github.com/sample/project/issues/${issueNumber}`,
      isPullRequest: issueNumber === 8,
      user: issueNumber === 7 ? reporter : { id: 5, login: "other-pr-author" },
    }),
    ...overrides,
  };
}

async function collect(selected = client(), options = {}) {
  return collectLiveMergedPullRequestEvidence({
    client: selected,
    repository: "sample/project",
    pullRequestNumber: 42,
    collectContributorCandidates: true,
    ...options,
  });
}

test("reviewers and issue reporters are deduplicated by account ID without assigning credit", async () => {
  const result = await collect();
  assert.equal(result.contributor.id, "1");
  assert.equal(result.evidence.items[0].kind, "pull_request");
  assert.deepEqual(
    result.contributorCandidates.map((candidate) => [
      candidate.contributor.id,
      candidate.contributor.login,
      candidate.roles,
    ]),
    [
      ["2", "reviewer", ["reviewer"]],
      ["3", "reporter", ["reviewer", "issue_reporter"]],
    ],
  );
  for (const candidate of result.contributorCandidates) {
    assert.equal(candidate.requiresMaintainerReview, true);
    assert.equal(candidate.maintainerApprovalStatus, undefined);
    assert.ok(
      candidate.evidenceRefs.every(
        (ref) => ref.url.startsWith("https://github.com/") && ref.excerpt === undefined,
      ),
    );
  }
  assert.equal(result.contributorCandidates[0].evidenceRefs.length, 2);
  assert.equal(result.collectionCoverage.candidateIssueLookupsUnavailable, 0);
});

test("new review and issue content redacts before truncation and provider preparation", async () => {
  const result = await collect();
  assert.equal(JSON.stringify(result).includes(material), false);
  const prepared = prepareEvidenceForProvider(result.evidence);
  assert.equal(prepared.redactionReport.occurrences.length, 2);
  assert.equal(JSON.stringify(prepared).includes(material), false);
});

test("unavailable candidate APIs report coverage without copying error bodies", async () => {
  const result = await collect(
    client({
      listPullRequestReviews: async () => {
        throw new Error("must-not-appear");
      },
      getIssue: async () => {
        throw new Error("must-not-appear");
      },
    }),
  );
  assert.equal(result.collectionCoverage.candidateReviewsMayBeOmitted, true);
  assert.equal(result.collectionCoverage.candidateIssueLookupsUnavailable, 2);
  assert.equal(result.contributorCandidates.length, 1);
  assert.equal(JSON.stringify(result).includes("must-not-appear"), false);
});

test("candidate discovery is opt-in for existing Action and injected collector clients", async () => {
  const result = await collect(
    client({
      listPullRequestReviews: async () => assert.fail("not opted in"),
      getIssue: async () => assert.fail("not opted in"),
    }),
    { collectContributorCandidates: false },
  );
  assert.equal(result.contributorCandidates, undefined);
});

test("discovery limits review processing and issue calls and reports omissions", async () => {
  let issueCalls = 0;
  let reviewBudget;
  const selected = client({
    getPullRequest: async () => ({
      ...(await client().getPullRequest()),
      body: Array.from({ length: 15 }, (_, i) => `#${i + 1}`).join(" "),
    }),
    listPullRequestReviewComments: async () => [],
    listPullRequestReviews: async (_input, limit) => {
      reviewBudget = limit;
      return Array.from({ length: 26 }, (_, i) => ({
        id: i + 1,
        state: "APPROVED",
        user: { id: i + 100, login: `reviewer-${i}` },
      }));
    },
    getIssue: async ({ issueNumber }) => {
      issueCalls += 1;
      return {
        number: issueNumber,
        title: "Report",
        htmlUrl: `https://github.com/sample/project/issues/${issueNumber}`,
        isPullRequest: false,
        user: reporter,
      };
    },
  });
  const result = await collect(selected);
  assert.equal(issueCalls, 10);
  assert.equal(reviewBudget, 26);
  assert.equal(result.collectionCoverage.candidateReviewsMayBeOmitted, true);
  assert.equal(result.collectionCoverage.candidateIssuesMayBeOmitted, true);
  assert.equal(result.contributorCandidates.length, 26);
});

test("bounded API client parses submitted reviews and distinguishes issue endpoint PRs", async () => {
  const requests = [];
  const api = createGitHubApiClient({
    fetch: async (input) => {
      requests.push(String(input));
      const value = String(input).includes("/reviews?")
        ? [{ id: 101, state: "APPROVED", user: { ...reviewer, type: "User" } }]
        : {
            number: 7,
            title: "Linked PR",
            html_url: "https://github.com/sample/project/pull/7",
            pull_request: {},
            user: null,
          };
      return new Response(JSON.stringify(value), { status: 200 });
    },
  });
  const reviews = await api.listPullRequestReviews(
    { repository: "sample/project", pullRequestNumber: 42 },
    26,
  );
  const issue = await api.getIssue({ repository: "sample/project", issueNumber: 7 });
  assert.equal(reviews[0].user.kind, "human");
  assert.equal(issue.isPullRequest, true);
  assert.equal(issue.user, undefined);
  assert.match(requests[0], /reviews\?per_page=26&page=1$/);
  assert.match(requests[1], /\/issues\/7$/);
});

test("GitHub REST merge timestamps normalize to the shared canonical source contract", async () => {
  const result = await collect(
    client({
      getPullRequest: async () => ({
        ...(await client().getPullRequest()),
        mergedAt: "2026-07-08T00:00:00Z",
      }),
    }),
  );
  assert.equal(result.evidence.source.mergedAt, "2026-07-08T00:00:00.000Z");
});
