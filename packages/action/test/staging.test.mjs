import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RendererValidationError,
  RENDERED_OUTPUT_PATHS,
  renderRecognitionOutputs
} from "@clarissimi/renderers";

import {
  ProposalOutputStagingError,
  stageProposalDraftReviewOutput,
  stageProposalRecognitionOutputs
} from "../dist/index.js";

const source = {
  repository: "sample/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z"
};

function assessment(overrides = {}) {
  return {
    schemaVersion: "clarissimi.assessment/v1",
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
        url: "https://github.com/sample/project/pull/42",
        title: "Add parser regression coverage"
      }
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
    maintainerApprovalStatus: "approved",
    source,
    ...overrides
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-staging-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test("stages renderer outputs with deterministic file metadata", async () => {
  await withTempDir(async (dir) => {
    const approved = assessment();
    const result = await stageProposalRecognitionOutputs({
      outputDir: dir,
      assessments: [approved],
      redactionMatchCount: 2
    });
    const expectedOutputs = renderRecognitionOutputs([approved]);
    const expected = new Map([
      [RENDERED_OUTPUT_PATHS.contributionsJsonl, expectedOutputs.contributionsJsonl],
      [RENDERED_OUTPUT_PATHS.contributorsJson, expectedOutputs.contributorsJson],
      [RENDERED_OUTPUT_PATHS.contributorsMarkdown, expectedOutputs.contributorsMarkdown],
      [RENDERED_OUTPUT_PATHS.staticDataJson, expectedOutputs.staticDataJson]
    ]);

    assert.equal(result.outputDir, dir);
    assert.equal(result.manifest.mode, "propose");
    assert.deepEqual(result.manifest.source, source);
    assert.equal(result.manifest.assessmentCount, 1);
    assert.deepEqual(result.manifest.approvalSummary, {
      approved: 1,
      autoApproved: 0
    });
    assert.equal(result.manifest.redactionMatchCount, 2);
    assert.deepEqual(
      result.manifest.files.map((file) => file.path),
      Array.from(expected.keys())
    );

    for (const file of result.manifest.files) {
      const content = await readFile(join(dir, file.path), "utf8");
      const expectedContent = expected.get(file.path);

      assert.equal(content, expectedContent);
      assert.equal(file.bytes, Buffer.byteLength(content, "utf8"));
      assert.equal(
        file.sha256,
        createHash("sha256").update(content, "utf8").digest("hex")
      );
    }
  });
});

test("stages the optional contributor summary table", async () => {
  await withTempDir(async (dir) => {
    const result = await stageProposalRecognitionOutputs({
      outputDir: dir,
      assessments: [assessment()],
      redactionMatchCount: 0,
      markdownSummary: "table"
    });
    const markdown = await readFile(join(dir, RENDERED_OUTPUT_PATHS.contributorsMarkdown), "utf8");

    assert.equal(result.manifest.mode, "propose");
    assert.equal(markdown.includes("| Contributor | Total | Types |"), true);
    assert.equal(markdown.includes("| [@octocat](https://github.com/octocat) | 1 | test 1 |"), true);
    assert.equal(markdown.includes("## octocat"), true);
  });
});

test("rejects draft assessments before staging public files", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(
      () =>
        stageProposalRecognitionOutputs({
          outputDir: dir,
          assessments: [assessment({ maintainerApprovalStatus: "draft" })],
          redactionMatchCount: 0
        }),
      ProposalOutputStagingError
    );

    assert.deepEqual(await readdir(dir), []);
  });
});

test("stages draft review output without public recognition files", async () => {
  await withTempDir(async (dir) => {
    const result = await stageProposalDraftReviewOutput({
      outputDir: dir,
      assessments: [
        assessment({
          maintainerApprovalStatus: "draft",
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "https://github.com/sample/project/pull/42",
              title: "Add parser regression coverage",
              excerpt: "PATCH_EXCERPT_SENTINEL"
            }
          ],
          rawProviderOutput: "PROVIDER_RAW_SENTINEL"
        })
      ],
      redactionMatchCount: 4
    });
    const filePaths = result.manifest.files.map((file) => file.path);
    const draftText = await readFile(join(dir, filePaths[0]), "utf8");

    assert.equal(result.manifest.mode, "stage-draft");
    assert.deepEqual(filePaths, [".clarissimi/drafts/sample-project-merged_pull_request-42.json"]);
    assert.equal(result.manifest.assessmentCount, 1);
    assert.deepEqual(result.manifest.approvalSummary, {
      approved: 0,
      autoApproved: 0
    });
    assert.equal(result.manifest.redactionMatchCount, 4);
    assert.equal(draftText.includes('"maintainerApprovalStatus": "draft"'), true);
    assert.equal(draftText.includes("PATCH_EXCERPT_SENTINEL"), false);
    assert.equal(draftText.includes("PROVIDER_RAW_SENTINEL"), false);
    assert.deepEqual(await readdir(join(dir, ".clarissimi")), ["drafts"]);
  });
});

test("rejects approved assessments before staging draft review output", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(
      () =>
        stageProposalDraftReviewOutput({
          outputDir: dir,
          assessments: [assessment()],
          redactionMatchCount: 0
        }),
      RendererValidationError
    );

    assert.deepEqual(await readdir(dir), []);
  });
});

test("keeps raw evidence and provider output out of staged metadata and files", async () => {
  await withTempDir(async (dir) => {
    const rawStrings = [
      "RAW_EVIDENCE_SENTINEL",
      "PROVIDER_RAW_SENTINEL",
      "SENSITIVE_VALUE_SENTINEL",
      "RAW_DIFF_SENTINEL",
      "PATCH_EXCERPT_SENTINEL"
    ];
    const result = await stageProposalRecognitionOutputs({
      outputDir: dir,
      assessments: [
        assessment({
          evidenceRefs: [
            {
              kind: "pull_request",
              id: "PR-42",
              url: "https://github.com/sample/project/pull/42",
              title: "Add parser regression coverage",
              excerpt: "PATCH_EXCERPT_SENTINEL"
            }
          ],
          rawEvidence: "RAW_EVIDENCE_SENTINEL",
          rawProviderOutput: "PROVIDER_RAW_SENTINEL",
          sensitiveValue: "SENSITIVE_VALUE_SENTINEL",
          rawDiff: "RAW_DIFF_SENTINEL"
        })
      ],
      redactionMatchCount: 3
    });
    const manifestText = JSON.stringify(result.manifest);
    const stagedContent = await Promise.all(
      result.manifest.files.map((file) => readFile(join(dir, file.path), "utf8"))
    );
    const stagedText = stagedContent.join("\n");

    for (const value of rawStrings) {
      assert.equal(manifestText.includes(value), false);
      assert.equal(stagedText.includes(value), false);
    }
  });
});

test("rejects mixed source events in one proposal manifest", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(
      () =>
        stageProposalRecognitionOutputs({
          outputDir: dir,
          assessments: [
            assessment(),
            assessment({
              source: {
                ...source,
                pullRequestNumber: 43
              }
            })
          ],
          redactionMatchCount: 0
        }),
      ProposalOutputStagingError
    );
  });
});
