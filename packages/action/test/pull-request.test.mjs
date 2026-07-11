import assert from "node:assert/strict";
import test from "node:test";

import {
  ProposalPullRequestClientError,
  ProposalPullRequestCreatorError,
  buildProposalPullRequestBody,
  buildProposalPullRequestTitle,
  createOrUpdateProposalPullRequest,
} from "../dist/index.js";

const manifest = {
  mode: "propose",
  source: {
    repository: "sample/project",
    event: "merged_pull_request",
    pullRequestNumber: 42,
    mergedAt: "2026-07-08T00:00:00.000Z",
  },
  assessmentCount: 1,
  approvalSummary: {
    approved: 1,
    autoApproved: 0,
  },
  redactionMatchCount: 3,
  files: [
    {
      path: ".clarissimi/contributions.jsonl",
      bytes: 10,
      sha256: "a".repeat(64),
    },
    {
      path: ".clarissimi/contributors.json",
      bytes: 11,
      sha256: "b".repeat(64),
    },
    {
      path: "CONTRIBUTORS.md",
      bytes: 12,
      sha256: "c".repeat(64),
    },
  ],
};

const branch = {
  branchName: "clarissimi/recognition/merged_pull_request-42",
  baseBranch: "main",
  baseCommitSha: "1111111111111111111111111111111111111111",
  commitSha: "2222222222222222222222222222222222222222",
  changedFiles: [
    ".clarissimi/contributions.jsonl",
    ".clarissimi/contributors.json",
    "CONTRIBUTORS.md",
  ],
  rollbackHint:
    "Delete branch clarissimi/recognition/merged_pull_request-42 before merge to discard this proposal.",
};

const draftManifest = {
  ...manifest,
  mode: "stage-draft",
  approvalSummary: {
    approved: 0,
    autoApproved: 0,
  },
  files: [
    {
      path: ".clarissimi/drafts/sample-project-merged_pull_request-42.json",
      bytes: 10,
      sha256: "d".repeat(64),
    },
  ],
};

const draftBranch = {
  ...branch,
  branchName: "clarissimi/drafts/merged_pull_request-42",
  changedFiles: [
    ".clarissimi/drafts/sample-project-merged_pull_request-42.json",
  ],
  rollbackHint:
    "Delete branch clarissimi/drafts/merged_pull_request-42 before merge to discard this proposal.",
};

test("creates a proposal pull request through a fake client", async () => {
  const client = new FakePullRequestClient();

  const result = await createOrUpdateProposalPullRequest({
    client,
    manifest,
    branch,
  });

  assert.equal(result.action, "created");
  assert.equal(result.title.startsWith("Clarissimi recognition:"), true);
  assert.equal(result.title, "Clarissimi recognition: sample/project#42");
  assert.equal(result.pullRequest.number, 1);
  assert.equal(client.created.length, 1);
  assert.equal(client.updated.length, 0);
  assert.deepEqual(client.created[0], {
    repository: "sample/project",
    headBranch: "clarissimi/recognition/merged_pull_request-42",
    baseBranch: "main",
    title: result.title,
    body: result.body,
  });
  assert.equal(result.body.includes("- Pull request: #42"), true);
  assert.equal(result.body.includes("- Redaction matches: 3"), true);
  assert.equal(result.body.includes("Maintainers own final approval"), true);
});

test("creates a draft review pull request without implying public approval", async () => {
  const client = new FakePullRequestClient();

  const result = await createOrUpdateProposalPullRequest({
    client,
    manifest: draftManifest,
    branch: draftBranch,
    maintainerApprovalNote: "Review the staged draft before importing it.",
  });

  assert.equal(result.action, "created");
  assert.equal(result.title, "Clarissimi draft review: sample/project#42");
  assert.equal(
    result.body.includes("## Clarissimi draft review proposal"),
    true,
  );
  assert.equal(result.body.includes("### Staged draft files"), true);
  assert.equal(result.body.includes("- Drafts staged: 1"), true);
  assert.equal(result.body.includes("- Approved: 0"), true);
  assert.equal(
    result.body.includes("Review the staged draft before importing it."),
    true,
  );
  assert.equal(
    client.created[0].headBranch,
    "clarissimi/drafts/merged_pull_request-42",
  );
});

test("updates an existing proposal pull request instead of creating a duplicate", async () => {
  const client = new FakePullRequestClient({
    existing: {
      number: 7,
      url: "https://github.com/sample/project/pull/7",
      headBranch: branch.branchName,
      baseBranch: branch.baseBranch,
      title: "Clarissimi recognition: old",
    },
  });

  const result = await createOrUpdateProposalPullRequest({
    client,
    manifest,
    branch,
    maintainerApprovalNote: "Maintainer review is still required before merge.",
  });

  assert.equal(result.action, "updated");
  assert.equal(result.pullRequest.number, 7);
  assert.equal(client.created.length, 0);
  assert.equal(client.updated.length, 1);
  assert.deepEqual(client.updated[0], {
    repository: "sample/project",
    number: 7,
    title: result.title,
    body: result.body,
  });
  assert.equal(
    result.body.includes("Maintainer review is still required before merge."),
    true,
  );
});

test("can target the runner repository while preserving source repository text", async () => {
  const client = new FakePullRequestClient();

  const result = await createOrUpdateProposalPullRequest({
    client,
    manifest,
    branch,
    targetRepository: "0disoft/clarissimi",
  });

  assert.equal(result.action, "created");
  assert.deepEqual(client.created[0], {
    repository: "0disoft/clarissimi",
    headBranch: "clarissimi/recognition/merged_pull_request-42",
    baseBranch: "main",
    title: result.title,
    body: result.body,
  });
  assert.equal(result.title, "Clarissimi recognition: sample/project#42");
  assert.equal(result.body.includes("- Repository: sample/project"), true);
});

test("keeps raw evidence and provider output out of the proposal title and body", () => {
  const rawStrings = [
    "RAW_EVIDENCE_SENTINEL",
    "PROVIDER_RAW_SENTINEL",
    "RAW_DIFF_SENTINEL",
    "PATCH_EXCERPT_SENTINEL",
  ];
  const text = [
    buildProposalPullRequestTitle({
      ...manifest,
      rawEvidence: "RAW_EVIDENCE_SENTINEL",
      rawProviderOutput: "PROVIDER_RAW_SENTINEL",
    }),
    buildProposalPullRequestBody({
      manifest: {
        ...manifest,
        rawEvidence: "RAW_EVIDENCE_SENTINEL",
        rawProviderOutput: "PROVIDER_RAW_SENTINEL",
      },
      branch: {
        ...branch,
        rawDiff: "RAW_DIFF_SENTINEL",
        patchExcerpt: "PATCH_EXCERPT_SENTINEL",
      },
      maintainerApprovalNote: "Maintainers own final approval.",
    }),
  ].join("\n");

  for (const value of rawStrings) {
    assert.equal(text.includes(value), false);
  }
});

test("keeps assessment scoring and share signals out of the proposal title and body", () => {
  const scoringStrings = [
    "CONFIDENCE_SENTINEL",
    "IMPACT_LEVEL_SENTINEL",
    "EVIDENCE_SUMMARY_SENTINEL",
    "INTERNAL_WEIGHT_SENTINEL",
    "SCORE_SHARE_SENTINEL",
    "CONTRIBUTION_WEIGHT_SHARE_SENTINEL",
    "IMPACT_WEIGHT_SHARE_SENTINEL",
    "RECENT_THREE_MONTH_SHARE_SENTINEL",
  ];
  const text = [
    buildProposalPullRequestTitle({
      ...manifest,
      confidence: "CONFIDENCE_SENTINEL",
      impactLevel: "IMPACT_LEVEL_SENTINEL",
      evidenceSummary: "EVIDENCE_SUMMARY_SENTINEL",
      internalImpactWeight: "INTERNAL_WEIGHT_SENTINEL",
      scoreShare: "SCORE_SHARE_SENTINEL",
      contributionWeightShare: "CONTRIBUTION_WEIGHT_SHARE_SENTINEL",
      impactWeightShare: "IMPACT_WEIGHT_SHARE_SENTINEL",
      recentThreeMonthShare: "RECENT_THREE_MONTH_SHARE_SENTINEL",
    }),
    buildProposalPullRequestBody({
      manifest: {
        ...manifest,
        confidence: "CONFIDENCE_SENTINEL",
        impactLevel: "IMPACT_LEVEL_SENTINEL",
        evidenceSummary: "EVIDENCE_SUMMARY_SENTINEL",
        internalImpactWeight: "INTERNAL_WEIGHT_SENTINEL",
        scoreShare: "SCORE_SHARE_SENTINEL",
        contributionWeightShare: "CONTRIBUTION_WEIGHT_SHARE_SENTINEL",
        impactWeightShare: "IMPACT_WEIGHT_SHARE_SENTINEL",
        recentThreeMonthShare: "RECENT_THREE_MONTH_SHARE_SENTINEL",
      },
      branch: {
        ...branch,
        confidence: "CONFIDENCE_SENTINEL",
        impactLevel: "IMPACT_LEVEL_SENTINEL",
        evidenceSummary: "EVIDENCE_SUMMARY_SENTINEL",
        internalImpactWeight: "INTERNAL_WEIGHT_SENTINEL",
        scoreShare: "SCORE_SHARE_SENTINEL",
        contributionWeightShare: "CONTRIBUTION_WEIGHT_SHARE_SENTINEL",
        impactWeightShare: "IMPACT_WEIGHT_SHARE_SENTINEL",
        recentThreeMonthShare: "RECENT_THREE_MONTH_SHARE_SENTINEL",
      },
    }),
  ].join("\n");

  for (const value of scoringStrings) {
    assert.equal(text.includes(value), false);
  }
});

test("bounds long changed file lists in the proposal body", () => {
  const manyFiles = Array.from(
    { length: 30 },
    (_, index) =>
      `.clarissimi/generated/file-${String(index).padStart(2, "0")}.json`,
  );
  const body = buildProposalPullRequestBody({
    manifest: {
      ...manifest,
      files: manyFiles.map((path) => ({
        path,
        bytes: 1,
        sha256: "d".repeat(64),
      })),
    },
    branch: {
      ...branch,
      changedFiles: manyFiles,
    },
  });

  assert.equal(
    body.includes("5 more file(s) omitted from this summary."),
    true,
  );
});

test("returns actionable diagnostics for token permission failures", async () => {
  const client = new FakePullRequestClient({
    createError: new ProposalPullRequestClientError(
      "permission_denied",
      "Resource not accessible by integration",
    ),
  });

  await assert.rejects(
    () =>
      createOrUpdateProposalPullRequest({
        client,
        manifest,
        branch,
      }),
    (error) =>
      error instanceof ProposalPullRequestCreatorError &&
      error.code === "pull_request_permission_denied" &&
      error.message.includes("pull-requests: write"),
  );
});

test("returns actionable diagnostics for repository setting blocks", async () => {
  const client = new FakePullRequestClient({
    createError: new ProposalPullRequestClientError(
      "repository_setting_blocked",
      "Workflow-created pull requests are disabled",
    ),
  });

  await assert.rejects(
    () =>
      createOrUpdateProposalPullRequest({
        client,
        manifest,
        branch,
      }),
    (error) =>
      error instanceof ProposalPullRequestCreatorError &&
      error.code === "pull_request_repository_setting_blocked" &&
      error.message.includes("workflow pull request creation"),
  );
});

test("returns actionable diagnostics when the target repository is not found", async () => {
  const client = new FakePullRequestClient({
    createError: new ProposalPullRequestClientError("not_found", "Not Found"),
  });

  await assert.rejects(
    () =>
      createOrUpdateProposalPullRequest({
        client,
        manifest,
        branch,
        targetRepository: "0disoft/clarissimi",
      }),
    (error) =>
      error instanceof ProposalPullRequestCreatorError &&
      error.code === "pull_request_target_not_found" &&
      error.message.includes("GITHUB_REPOSITORY"),
  );
});

test("rejects missing changed files before calling the fake client", async () => {
  const client = new FakePullRequestClient();

  await assert.rejects(
    () =>
      createOrUpdateProposalPullRequest({
        client,
        manifest,
        branch: {
          ...branch,
          changedFiles: [],
        },
      }),
    ProposalPullRequestCreatorError,
  );
  assert.equal(client.created.length, 0);
  assert.equal(client.updated.length, 0);
});

class FakePullRequestClient {
  created = [];
  updated = [];
  #existing;
  #createError;

  constructor(options = {}) {
    this.#existing = options.existing ?? null;
    this.#createError = options.createError;
  }

  async findOpenPullRequest() {
    return this.#existing;
  }

  async createPullRequest(input) {
    if (this.#createError !== undefined) {
      throw this.#createError;
    }

    this.created.push(input);
    return {
      number: 1,
      url: "https://github.com/sample/project/pull/1",
      headBranch: input.headBranch,
      baseBranch: input.baseBranch,
      title: input.title,
    };
  }

  async updatePullRequest(input) {
    this.updated.push(input);
    return {
      number: input.number,
      url: `https://github.com/sample/project/pull/${input.number}`,
      headBranch: this.#existing?.headBranch ?? branch.branchName,
      baseBranch: this.#existing?.baseBranch ?? branch.baseBranch,
      title: input.title,
    };
  }
}
