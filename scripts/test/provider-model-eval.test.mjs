import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { OpenAiCompatibleProviderError } from "../../packages/providers/dist/index.js";
import { runProviderModelEval } from "../provider-model-eval.mjs";

test("provider model eval check validates a multi-model matrix without provider calls", async () => {
  await withMatrix(async (matrixPath) => {
    let stdout = "";
    let stderr = "";
    let providerCalls = 0;
    const exitCode = await runProviderModelEval(["--check", "--matrix", matrixPath], {
      env: {},
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
      providerFactory: () => {
        providerCalls += 1;
        throw new Error("PROVIDER_SHOULD_NOT_RUN");
      },
    });

    const report = JSON.parse(stdout);
    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(providerCalls, 0);
    assert.equal(report.mode, "check");
    assert.equal(report.modelCount, 2);
    assert.equal(report.caseCount, 2);
  });
});

test("provider model eval requires every named token before the first provider call", async () => {
  await withMatrix(async (matrixPath) => {
    let stderr = "";
    let providerCalls = 0;
    const exitCode = await runProviderModelEval(["--matrix", matrixPath], {
      env: { CLARISSIMI_EVAL_PROVIDER_A_TOKEN: "token-a" },
      stdout: () => {},
      stderr: (value) => {
        stderr += value;
      },
      providerFactory: () => {
        providerCalls += 1;
        return { id: "should-not-run", createAssessment: async () => ({}) };
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(providerCalls, 0);
    assert.match(stderr, /CLARISSIMI_EVAL_PROVIDER_B_TOKEN/);
    assert.match(stderr, /No provider call was made/);
  });
});

test("provider model eval emits sanitized per-model results without tokens or error messages", async () => {
  await withMatrix(async (matrixPath) => {
    let stdout = "";
    let stderr = "";
    const exitCode = await runProviderModelEval(["--matrix", matrixPath], {
      env: {
        CLARISSIMI_EVAL_PROVIDER_A_TOKEN: "TOKEN_A_SENTINEL",
        CLARISSIMI_EVAL_PROVIDER_B_TOKEN: "TOKEN_B_SENTINEL",
      },
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
      providerFactory: (options) => ({
        id: options.id,
        async createAssessment() {
          if (options.id === "provider-model-b") {
            throw new OpenAiCompatibleProviderError(
              "invalid_assessment",
              "RAW_PROVIDER_ERROR_SENTINEL",
              [
                {
                  path: "$.impactLevel",
                  code: "provider_result_high_impact_support_missing",
                  message: "RAW_PROVIDER_ISSUE_SENTINEL",
                },
              ],
            );
          }
          return {};
        },
      }),
    });

    const report = JSON.parse(stdout);
    assert.equal(exitCode, 1);
    assert.equal(stderr, "");
    assert.equal(report.mode, "live");
    assert.equal(report.modelCount, 2);
    assert.equal(report.caseCount, 2);
    assert.equal(report.passed, 2);
    assert.equal(report.failed, 2);
    assert.equal(
      report.results[1].cases[0].issueCodes.includes("provider_result_high_impact_support_missing"),
      true,
    );
    assert.equal(stdout.includes("TOKEN_A_SENTINEL"), false);
    assert.equal(stdout.includes("TOKEN_B_SENTINEL"), false);
    assert.equal(stdout.includes("RAW_PROVIDER_ERROR_SENTINEL"), false);
    assert.equal(stdout.includes("RAW_PROVIDER_ISSUE_SENTINEL"), false);
  });
});

test("provider model eval sanitizes provider construction failures", async () => {
  await withMatrix(async (matrixPath) => {
    let stdout = "";
    const exitCode = await runProviderModelEval(["--matrix", matrixPath], {
      env: {
        CLARISSIMI_EVAL_PROVIDER_A_TOKEN: "token-a",
        CLARISSIMI_EVAL_PROVIDER_B_TOKEN: "token-b",
      },
      stdout: (value) => {
        stdout += value;
      },
      stderr: () => {},
      providerFactory: () => {
        throw new OpenAiCompatibleProviderError(
          "invalid_options",
          "RAW_PROVIDER_CONSTRUCTION_SENTINEL",
        );
      },
    });

    const report = JSON.parse(stdout);
    assert.equal(exitCode, 1);
    assert.equal(report.failed, 4);
    assert.equal(report.results[0].cases[0].errorCode, "invalid_options");
    assert.equal(stdout.includes("RAW_PROVIDER_CONSTRUCTION_SENTINEL"), false);
  });
});

async function withMatrix(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-provider-model-eval-"));
  try {
    const matrixPath = join(dir, "matrix.json");
    await writeFile(matrixPath, `${JSON.stringify(validMatrix(), null, 2)}\n`, "utf8");
    await callback(matrixPath);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function validMatrix() {
  return {
    schemaVersion: "clarissimi.provider-model-eval-matrix/v1",
    limits: {
      timeoutMs: 120000,
      maxTokens: 1200,
      maxResponseBytes: 2097152,
    },
    caseIds: ["parser-regression-test", "documentation-clarification"],
    models: [
      {
        id: "provider-model-a",
        model: "model-snapshot-a",
        endpoint: "https://provider-a.example/v1/chat/completions",
        tokenEnv: "CLARISSIMI_EVAL_PROVIDER_A_TOKEN",
        thinking: "disabled",
      },
      {
        id: "provider-model-b",
        model: "model-snapshot-b",
        endpoint: "https://provider-b.example/v1/chat/completions",
        tokenEnv: "CLARISSIMI_EVAL_PROVIDER_B_TOKEN",
        thinking: "disabled",
      },
    ],
  };
}
