import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { prepareEvidenceForProvider } from "../packages/core/dist/index.js";
import {
  createOpenAiCompatibleContributionDraftProvider,
  OpenAiCompatibleProviderError,
} from "../packages/providers/dist/index.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const corpusPath = resolve(repoRoot, "packages/providers/test/fixtures/result-quality-corpus.json");
const schemaVersion = "clarissimi.provider-model-eval-matrix/v1";
const maxMatrixBytes = 64 * 1024;
const maxModels = 8;
const maxCases = 12;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const envNamePattern = /^[A-Z][A-Z0-9_]{2,63}$/;
const forbiddenConfigKeys = /^(?:token|secret|apiKey|authorization)$/i;

export async function runProviderModelEval(args, overrides = {}) {
  const runtime = {
    env: overrides.env ?? process.env,
    readFile: overrides.readFile ?? readFile,
    stdout: overrides.stdout ?? ((value) => process.stdout.write(value)),
    stderr: overrides.stderr ?? ((value) => process.stderr.write(value)),
    providerFactory: overrides.providerFactory ?? createOpenAiCompatibleContributionDraftProvider,
  };
  const options = parseArgs(args);
  if (!options.ok) {
    runtime.stderr(`${options.message}\n`);
    runtime.stderr("Use --help for usage. No provider call was made.\n");
    return 2;
  }
  if (options.help) {
    runtime.stdout(`${usageText()}\n`);
    return 0;
  }

  let matrix;
  let corpus;
  try {
    matrix = await readJsonFile(runtime.readFile, resolve(options.matrixPath), maxMatrixBytes);
    corpus = await readJsonFile(runtime.readFile, corpusPath, 1024 * 1024);
    validateMatrix(matrix, corpus);
  } catch (error) {
    runtime.stderr(`provider model eval configuration failed: ${safeErrorMessage(error)}\n`);
    runtime.stderr("No provider call was made.\n");
    return 2;
  }

  if (options.check) {
    writeJson(runtime.stdout, {
      schemaVersion,
      ok: true,
      mode: "check",
      modelCount: matrix.models.length,
      caseCount: matrix.caseIds.length,
      models: matrix.models.map(({ id, model, tokenEnv }) => ({ id, model, tokenEnv })),
      caseIds: matrix.caseIds,
    });
    return 0;
  }

  const tokens = new Map();
  for (const model of matrix.models) {
    const value = runtime.env[model.tokenEnv];
    if (typeof value !== "string" || value.trim().length === 0) {
      runtime.stderr(`provider model eval requires environment variable ${model.tokenEnv}.\n`);
      runtime.stderr("No provider call was made.\n");
      return 2;
    }
    tokens.set(model.id, value);
  }

  const casesById = new Map(corpus.cases.map((entry) => [entry.id, entry]));
  const results = [];
  for (const model of matrix.models) {
    let provider;
    try {
      provider = runtime.providerFactory({
        id: model.id,
        endpoint: model.endpoint,
        model: model.model,
        token: tokens.get(model.id),
        timeoutMs: matrix.limits.timeoutMs,
        maxTokens: matrix.limits.maxTokens,
        maxResponseBytes: matrix.limits.maxResponseBytes,
        ...(model.thinking === undefined ? {} : { thinking: model.thinking }),
      });
    } catch (error) {
      const caseResults = matrix.caseIds.map((caseId) => sanitizeProviderFailure(caseId, error));
      results.push({
        id: model.id,
        model: model.model,
        passed: 0,
        failed: caseResults.length,
        cases: caseResults,
      });
      continue;
    }
    const caseResults = [];
    for (const [index, caseId] of matrix.caseIds.entries()) {
      const entry = casesById.get(caseId);
      const source = {
        repository: "example/provider-model-eval",
        event: "merged_pull_request",
        pullRequestNumber: index + 1,
        mergedAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      };
      const preparedEvidence = prepareEvidenceForProvider({ source, items: entry.items });
      try {
        await provider.createAssessment({
          contributor: corpus.contributor,
          preparedEvidence,
          ...(entry.hints === undefined ? {} : { hints: entry.hints }),
        });
        caseResults.push({ caseId, ok: true });
      } catch (error) {
        caseResults.push(sanitizeProviderFailure(caseId, error));
      }
    }
    results.push({
      id: model.id,
      model: model.model,
      passed: caseResults.filter((entry) => entry.ok).length,
      failed: caseResults.filter((entry) => !entry.ok).length,
      cases: caseResults,
    });
  }

  const failed = results.reduce((total, result) => total + result.failed, 0);
  writeJson(runtime.stdout, {
    schemaVersion,
    ok: failed === 0,
    mode: "live",
    modelCount: matrix.models.length,
    caseCount: matrix.caseIds.length,
    passed: matrix.models.length * matrix.caseIds.length - failed,
    failed,
    results,
  });
  return failed === 0 ? 0 : 1;
}

function parseArgs(args) {
  const options = { check: false, help: false, matrixPath: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--matrix") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, message: "--matrix requires a file path." };
      }
      options.matrixPath = value;
      index += 1;
      continue;
    }
    return { ok: false, message: `Unsupported provider model eval option: ${arg}` };
  }
  if (options.help) {
    return { ok: true, ...options };
  }
  if (options.matrixPath === undefined) {
    return { ok: false, message: "--matrix is required." };
  }
  return { ok: true, ...options };
}

function validateMatrix(matrix, corpus) {
  assertObject(matrix, "matrix");
  assertNoForbiddenKeys(matrix, "matrix");
  if (matrix.schemaVersion !== schemaVersion) {
    throw new Error(`schemaVersion must be ${schemaVersion}.`);
  }
  if (
    !Array.isArray(matrix.models) ||
    matrix.models.length < 2 ||
    matrix.models.length > maxModels
  ) {
    throw new Error(`models must contain between 2 and ${maxModels} entries.`);
  }
  if (
    !Array.isArray(matrix.caseIds) ||
    matrix.caseIds.length === 0 ||
    matrix.caseIds.length > maxCases
  ) {
    throw new Error(`caseIds must contain between 1 and ${maxCases} entries.`);
  }
  assertObject(matrix.limits, "limits");
  assertIntegerRange(matrix.limits.timeoutMs, 1_000, 300_000, "limits.timeoutMs");
  assertIntegerRange(matrix.limits.maxTokens, 100, 4_000, "limits.maxTokens");
  assertIntegerRange(
    matrix.limits.maxResponseBytes,
    1_024,
    2 * 1024 * 1024,
    "limits.maxResponseBytes",
  );

  const modelIds = new Set();
  for (const model of matrix.models) {
    assertObject(model, "model entry");
    if (!idPattern.test(model.id ?? "")) {
      throw new Error("model id must use lowercase letters, numbers, and single hyphens.");
    }
    if (modelIds.has(model.id)) {
      throw new Error(`duplicate model id: ${model.id}`);
    }
    modelIds.add(model.id);
    assertBoundedString(model.model, 1, 128, `${model.id}.model`);
    assertBoundedString(model.endpoint, 1, 2048, `${model.id}.endpoint`);
    validateHttpsEndpoint(model.endpoint, `${model.id}.endpoint`);
    if (!envNamePattern.test(model.tokenEnv ?? "")) {
      throw new Error(`${model.id}.tokenEnv must be an uppercase environment variable name.`);
    }
    if (model.thinking !== undefined && model.thinking !== "disabled") {
      throw new Error(`${model.id}.thinking supports only disabled.`);
    }
  }

  if (new Set(matrix.caseIds).size !== matrix.caseIds.length) {
    throw new Error("caseIds must be unique.");
  }
  const acceptedCases = new Set(
    corpus.cases.filter((entry) => entry.expectedIssueCodes.length === 0).map((entry) => entry.id),
  );
  for (const caseId of matrix.caseIds) {
    if (!acceptedCases.has(caseId)) {
      throw new Error(`caseIds includes unknown or rejected golden case: ${caseId}`);
    }
  }
}

function assertNoForbiddenKeys(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenConfigKeys.test(key)) {
      throw new Error(`${path} contains forbidden secret field ${key}; use tokenEnv.`);
    }
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
}

function validateHttpsEndpoint(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
}

function sanitizeProviderFailure(caseId, error) {
  if (error instanceof OpenAiCompatibleProviderError) {
    return {
      caseId,
      ok: false,
      errorCode: error.code,
      retryable: error.retryable,
      issueCodes: [...new Set((error.issues ?? []).map((issue) => issue.code))].sort(),
    };
  }
  return { caseId, ok: false, errorCode: "unexpected_error", retryable: false, issueCodes: [] };
}

async function readJsonFile(readFileImpl, path, maxBytes) {
  const content = await readFileImpl(path, "utf8");
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    throw new Error(`${path} exceeds the ${maxBytes}-byte limit.`);
  }
  return JSON.parse(content);
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertBoundedString(value, min, max, label) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new Error(`${label} must contain between ${min} and ${max} characters.`);
  }
}

function assertIntegerRange(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
}

function safeErrorMessage(error) {
  return error instanceof SyntaxError
    ? "matrix or corpus JSON is invalid."
    : String(error.message ?? error);
}

function writeJson(writer, value) {
  writer(`${JSON.stringify(value, null, 2)}\n`);
}

function usageText() {
  return [
    "Usage: pnpm run provider-model-eval -- --matrix <path> [--check]",
    "",
    "--check validates the matrix and selected golden cases without reading tokens or calling providers.",
    "Live mode reads only the token environment variables named by the matrix, calls models sequentially, performs no retries, and emits sanitized JSON.",
  ].join("\n");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runProviderModelEval(process.argv.slice(2)));
}
