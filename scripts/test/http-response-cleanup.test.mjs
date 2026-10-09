import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prepareEvidenceForProvider } from "../../packages/core/dist/index.js";
import {
  OpenAiCompatibleProviderError,
  createOpenAiCompatibleContributionDraftProvider,
} from "../../packages/providers/dist/index.js";
import { GitHubApiClientError, createGitHubApiClient } from "../../packages/github/dist/index.js";
import {
  ProposalPullRequestClientError,
  createGitHubPullRequestClient,
} from "../../packages/action/dist/index.js";

const fixture = JSON.parse(
  await readFile(new URL("../../fixtures/merged-pr-basic.json", import.meta.url), "utf8"),
);
const providerInput = {
  contributor: fixture.contributor,
  preparedEvidence: prepareEvidenceForProvider(fixture.evidence),
};
const clients = [
  {
    name: "provider",
    errorType: OpenAiCompatibleProviderError,
    request(options) {
      return createOpenAiCompatibleContributionDraftProvider({
        ...options,
        token: "unit-token",
        model: "clarissimi-test-model",
      }).createAssessment(providerInput);
    },
  },
  {
    name: "GitHub evidence",
    errorType: GitHubApiClientError,
    request(options) {
      return createGitHubApiClient(options).getPullRequest({
        repository: "sample/project",
        pullRequestNumber: 42,
      });
    },
  },
  {
    name: "Action GitHub",
    errorType: ProposalPullRequestClientError,
    request(options) {
      return createGitHubPullRequestClient({
        ...options,
        token: "test-token",
        sleep: async () => {},
        random: () => 0.5,
      }).findOpenPullRequest({
        repository: "sample/project",
        headBranch: "clarissimi/recognition/merged_pull_request-42",
        baseBranch: "main",
      });
    },
  },
];

for (const client of clients) {
  for (const sizeSource of ["content-length", "stream"]) {
    for (const cleanup of ["complete", "reject", "stall"]) {
      test(`${client.name} cancels oversized ${sizeSource} responses when cleanup ${cleanup}s`, async () => {
        let attempts = 0;
        let cancellations = 0;
        let reads = 0;
        const options = {
          timeoutMs: 100,
          maxResponseBytes: 8,
          fetch: async () => {
            attempts += 1;
            return new Response(
              new ReadableStream(
                {
                  pull(controller) {
                    reads += 1;
                    controller.enqueue(new TextEncoder().encode("123456789"));
                  },
                  cancel() {
                    cancellations += 1;
                    if (cleanup === "reject") {
                      return Promise.reject(new Error("RAW_CLEANUP_ERROR"));
                    }
                    if (cleanup === "stall") {
                      return new Promise(() => {});
                    }
                  },
                },
                { highWaterMark: 0 },
              ),
              sizeSource === "content-length" ? { headers: { "content-length": "9" } } : {},
            );
          },
        };
        await assert.rejects(
          () => client.request(options),
          (error) =>
            error instanceof client.errorType &&
            error.code === "response_too_large" &&
            error.retryable === false &&
            !error.message.includes("RAW_CLEANUP_ERROR"),
        );
        assert.equal(attempts, 1);
        assert.equal(cancellations, 1);
        assert.equal(reads, sizeSource === "content-length" ? 0 : 1);
      });
    }
  }
}
