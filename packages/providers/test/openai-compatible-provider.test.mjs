import assert from "node:assert/strict";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";

import {
  OpenAiCompatibleProviderError,
  createOpenAiCompatibleContributionDraftProvider,
} from "../dist/index.js";

const contributor = {
  platform: "github",
  id: "123456",
  login: "octocat",
  profileUrl: "https://github.com/octocat",
};

const source = {
  repository: "example/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z",
};

function preparedEvidence() {
  return prepareEvidenceForProvider({
    source,
    items: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: "Add parser regression coverage",
        text: "Maintainer contact person@example.com confirmed the regression.",
      },
      {
        kind: "test",
        id: "tests/parser.test.ts",
        title: "parser regression test",
      },
    ],
  });
}

test("creates a draft assessment from an OpenAI-compatible response", async () => {
  const requests = [];
  const provider = createOpenAiCompatibleContributionDraftProvider({
    endpoint: "https://provider.example/v1/chat/completions",
    model: "clarissimi-test-model",
    token: "unit-token",
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contributionType: "test",
                affectedArea: "parser regression coverage",
                impactLevel: "medium",
                evidenceSummary:
                  "Added regression coverage based on the merged pull request and test evidence.",
                suggestedBadge: "Regression Shield",
                publicRecognitionText: "Added regression coverage for the parser.",
                confidence: 0.82,
                maintainerApprovalStatus: "approved",
                contributor: {
                  platform: "github",
                  id: "999",
                  login: "changed",
                  profileUrl: "https://github.com/changed",
                },
                source: {
                  repository: "other/repo",
                  event: "merged_pull_request",
                  pullRequestNumber: 99,
                },
                evidenceRefs: [],
              }),
            },
          },
        ],
      });
    },
  });
  const evidence = preparedEvidence();

  const assessment = await provider.createAssessment({
    contributor,
    preparedEvidence: evidence,
  });

  assert.equal(provider.id, "openai-compatible");
  assert.equal(assessment.contributionType, "test");
  assert.equal(assessment.maintainerApprovalStatus, "draft");
  assert.deepEqual(assessment.contributor, contributor);
  assert.deepEqual(assessment.source, source);
  assert.deepEqual(assessment.evidenceRefs, evidence.evidenceRefs);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://provider.example/v1/chat/completions");
  assert.equal(requests[0].headers.Authorization, "Bearer unit-token");
  assert.equal(requests[0].body.model, "clarissimi-test-model");
  assert.equal(requests[0].body.response_format.type, "json_object");
  assert.equal(requests[0].body.thinking, undefined);
  assert.equal(requests[0].body.messages[0].content.includes("score shares"), true);
  assert.equal(
    requests[0].body.messages[0].content.includes("recent time-window contribution percentages"),
    true,
  );
  const requestText = JSON.stringify(requests[0].body);
  assert.equal(requestText.includes("person@example.com"), false);
  assert.equal(requestText.includes("[REDACTED]"), true);
});

test("can disable provider thinking for OpenAI-compatible providers that support it", async () => {
  const requests = [];
  const provider = createOpenAiCompatibleContributionDraftProvider({
    model: "minimax-m3",
    token: "unit-token",
    thinking: "disabled",
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(init.body),
      });
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contributionType: "test",
                affectedArea: "parser regression coverage",
                impactLevel: "medium",
                evidenceSummary: "Added regression coverage based on test evidence.",
                suggestedBadge: "Regression Shield",
                publicRecognitionText: "Added regression coverage for the parser.",
                confidence: 0.76,
              }),
            },
          },
        ],
      });
    },
  });

  const assessment = await provider.createAssessment({
    contributor,
    preparedEvidence: preparedEvidence(),
  });

  assert.equal(assessment.confidence, 0.76);
  assert.deepEqual(requests[0].body.thinking, { type: "disabled" });
});

test("supports text-array message content", async () => {
  const provider = createOpenAiCompatibleContributionDraftProvider({
    model: "clarissimi-test-model",
    token: "unit-token",
    fetch: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    contributionType: "test",
                    affectedArea: "parser regression coverage",
                    impactLevel: "medium",
                    evidenceSummary: "Added regression coverage based on test evidence.",
                    suggestedBadge: "Regression Shield",
                    publicRecognitionText: "Added regression coverage for the parser.",
                    confidence: 0.74,
                  }),
                },
              ],
            },
          },
        ],
      }),
  });

  const assessment = await provider.createAssessment({
    contributor,
    preparedEvidence: preparedEvidence(),
  });

  assert.equal(assessment.confidence, 0.74);
});

test("accepts markdown-fenced JSON message content from compatible providers", async () => {
  const provider = createOpenAiCompatibleContributionDraftProvider({
    model: "clarissimi-test-model",
    token: "unit-token",
    fetch: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: [
                "```json",
                JSON.stringify({
                  contributionType: "test",
                  affectedArea: "parser regression coverage",
                  impactLevel: "medium",
                  evidenceSummary: "Added regression coverage based on test evidence.",
                  suggestedBadge: "Regression Shield",
                  publicRecognitionText: "Added regression coverage for the parser.",
                  confidence: 0.71,
                }),
                "```",
              ].join("\n"),
            },
          },
        ],
      }),
  });

  const assessment = await provider.createAssessment({
    contributor,
    preparedEvidence: preparedEvidence(),
  });

  assert.equal(assessment.confidence, 0.71);
});

test("does not expose raw provider error bodies", async () => {
  const provider = createOpenAiCompatibleContributionDraftProvider({
    model: "clarissimi-test-model",
    token: "unit-token",
    fetch: async () =>
      jsonResponse(
        {
          error: {
            message: "RAW_PROVIDER_ERROR_BODY",
          },
        },
        500,
      ),
  });

  await assert.rejects(
    () =>
      provider.createAssessment({
        contributor,
        preparedEvidence: preparedEvidence(),
      }),
    (error) =>
      error instanceof OpenAiCompatibleProviderError &&
      error.code === "http_error" &&
      error.message.includes("500") &&
      !error.message.includes("RAW_PROVIDER_ERROR_BODY"),
  );
});

test("rejects invalid model drafts after schema validation", async () => {
  const provider = createOpenAiCompatibleContributionDraftProvider({
    model: "clarissimi-test-model",
    token: "unit-token",
    fetch: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contributionType: "test",
                affectedArea: "parser regression coverage",
                impactLevel: "medium",
                evidenceSummary: "Added regression coverage based on test evidence.",
                suggestedBadge: "Regression Shield",
                publicRecognitionText: "Top 1 contributor on the leaderboard.",
                confidence: 0.9,
              }),
            },
          },
        ],
      }),
  });

  await assert.rejects(
    () =>
      provider.createAssessment({
        contributor,
        preparedEvidence: preparedEvidence(),
      }),
    (error) =>
      error instanceof OpenAiCompatibleProviderError &&
      error.code === "invalid_assessment" &&
      error.issues.some((issue) => issue.code === "public_ranking_language"),
  );
});

test("rejects model drafts that include public contribution share language", async () => {
  const provider = createOpenAiCompatibleContributionDraftProvider({
    model: "clarissimi-test-model",
    token: "unit-token",
    fetch: async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contributionType: "test",
                affectedArea: "parser regression coverage",
                impactLevel: "medium",
                evidenceSummary:
                  "Held a 22 percent share of the last 3 months contribution weight.",
                suggestedBadge: "Regression Shield",
                publicRecognitionText: "Added regression coverage for the parser.",
                confidence: 0.9,
              }),
            },
          },
        ],
      }),
  });

  await assert.rejects(
    () =>
      provider.createAssessment({
        contributor,
        preparedEvidence: preparedEvidence(),
      }),
    (error) =>
      error instanceof OpenAiCompatibleProviderError &&
      error.code === "invalid_assessment" &&
      error.issues.some((issue) => issue.code === "public_ranking_language"),
  );
});

test("rejects missing credentials without reading environment variables", () => {
  assert.throws(
    () =>
      createOpenAiCompatibleContributionDraftProvider({
        model: "clarissimi-test-model",
        token: " ",
      }),
    (error) =>
      error instanceof OpenAiCompatibleProviderError &&
      error.code === "invalid_options" &&
      error.message.includes("token"),
  );
});

test("rejects unsupported thinking modes without reading environment variables", () => {
  assert.throws(
    () =>
      createOpenAiCompatibleContributionDraftProvider({
        model: "clarissimi-test-model",
        token: "unit-token",
        thinking: "enabled",
      }),
    (error) =>
      error instanceof OpenAiCompatibleProviderError &&
      error.code === "invalid_options" &&
      error.message.includes("thinking"),
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
