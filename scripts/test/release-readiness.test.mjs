import assert from "node:assert/strict";
import test from "node:test";

import {
  findHighRiskSecretLines,
  requiredPackageScripts,
  requiredTestGlobs,
  validateCiWorkflowContract,
  validateHostedLiveProviderWorkflowContract,
  validatePackageScriptRegistration
} from "../release-readiness.mjs";

test("release readiness accepts the current package script registration", () => {
  const packageJson = {
    scripts: createValidScripts()
  };

  assert.deepEqual(validatePackageScriptRegistration(packageJson), []);
});

test("release readiness rejects missing release-critical scripts", () => {
  const scripts = createValidScripts();
  delete scripts["hosted-live-provider-smoke"];

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.hosted-live-provider-smoke must be configured."
  ]);
});

test("release readiness rejects drifted release-critical script commands", () => {
  const scripts = createValidScripts();
  scripts["release-readiness"] = "node scripts/renamed-release-check.mjs";

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.release-readiness must include scripts/release-readiness.mjs."
  ]);
});

test("release readiness rejects missing package and script test globs", () => {
  const scripts = createValidScripts();
  scripts.test = scripts.test.replace(" packages/action/test/*.test.mjs", "");
  scripts.test = scripts.test.replace(" scripts/test/*.test.mjs", "");

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.test must include packages/action/test/*.test.mjs.",
    "package.json scripts.test must include scripts/test/*.test.mjs."
  ]);
});

test("release readiness secret scan detects provider gateway env assignments", () => {
  const names = [
    ["CLARISSIMI", "PROVIDER", "TOKEN"],
    ["OPENCODE", "GO", "API", "KEY"],
    ["UMANS", "API", "KEY"],
    ["DEEPSEEK", "API", "KEY"],
    ["NODE", "AUTH", "TOKEN"],
    ["GITHUB", "PAT", "ODISOFT"]
  ].map((parts) => parts.join("_"));
  const text = names.map((name, index) =>
    index === 0 ? `${name} = synthetic-token` : `${name}=synthetic-token`
  ).join("\n");

  assert.deepEqual(findHighRiskSecretLines("sample.env", text), [
    "sample.env:1",
    "sample.env:2",
    "sample.env:3",
    "sample.env:4",
    "sample.env:5",
    "sample.env:6"
  ]);
});

test("release readiness secret scan allows documented secret names without assigned values", () => {
  const text = [
    "Set CLARISSIMI_PROVIDER_TOKEN in repository secrets.",
    "$env:OPENAI_API_KEY | gh secret set CLARISSIMI_PROVIDER_TOKEN --repo owner/repo --app actions",
    "Provider examples may mention OPENCODE_GO_API_KEY or UMANS_API_KEY by name."
  ].join("\n");

  assert.deepEqual(findHighRiskSecretLines("docs/ops/secrets.md", text), []);
});

test("release readiness accepts the CI workflow contract", () => {
  assert.deepEqual(validateCiWorkflowContract(createCiWorkflowText()), []);
});

test("release readiness rejects CI workflow command drift", () => {
  const text = createCiWorkflowText()
    .replace("pnpm run release-readiness", "pnpm run docs")
    .replace("pnpm run contract", "pnpm run check");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must run pnpm run release-readiness.",
    ".github/workflows/ci.yml must run pnpm run contract."
  ]);
});

test("release readiness rejects CI workflow trigger and permission drift", () => {
  const text = createCiWorkflowText()
    .replace("pull_request:", "pull-request:")
    .replace("contents: read", "contents: write");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must define pull_request: trigger.",
    ".github/workflows/ci.yml must set contents: read."
  ]);
});

test("release readiness accepts the hosted live provider workflow contract", () => {
  assert.deepEqual(validateHostedLiveProviderWorkflowContract(createHostedWorkflowText()), []);
});

test("release readiness rejects hosted live provider workflow input drift", () => {
  const text = createHostedWorkflowText()
    .replace("provider-model:", "model-name:")
    .replace("required: false", "required: true");

  assert.deepEqual(validateHostedLiveProviderWorkflowContract(text), [
    ".github/workflows/clarissimi-live-provider-smoke.yml must define workflow_dispatch input provider-model.",
    ".github/workflows/clarissimi-live-provider-smoke.yml input provider-endpoint must set required: false."
  ]);
});

test("release readiness rejects hosted live provider workflow secret and command drift", () => {
  const text = createHostedWorkflowText()
    .replaceAll("CLARISSIMI_PROVIDER_TOKEN", "RENAMED_PROVIDER_TOKEN")
    .replace("pnpm run live-provider-smoke", "pnpm run smoke");

  assert.deepEqual(validateHostedLiveProviderWorkflowContract(text), [
    ".github/workflows/clarissimi-live-provider-smoke.yml must read secrets.CLARISSIMI_PROVIDER_TOKEN.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must run pnpm run live-provider-smoke."
  ]);
});

function createValidScripts() {
  const scripts = {
    test: `node --test ${requiredTestGlobs.join(" ")}`
  };

  for (const script of requiredPackageScripts) {
    scripts[script.name] = script.includes.join(" && ");
  }

  scripts.check = "pnpm run typecheck && pnpm run test";
  scripts.contract = "pnpm run typecheck && pnpm run test";

  return scripts;
}

function createCiWorkflowText() {
  return [
    "name: CI",
    "",
    "on:",
    "  push:",
    "    branches:",
    "      - main",
    "  pull_request:",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  validation:",
    "    steps:",
    "      - run: pnpm install --frozen-lockfile",
    "      - run: pnpm run docs",
    "      - run: pnpm run release-readiness",
    "      - run: pnpm run smoke",
    "      - run: pnpm run check",
    "      - run: pnpm run contract"
  ].join("\n");
}

function createHostedWorkflowText() {
  return [
    "name: Clarissimi live provider smoke",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      provider-model:",
    "        description: OpenAI-compatible model name for the smoke run.",
    "        required: true",
    "      provider-endpoint:",
    "        description: Optional OpenAI-compatible chat completions endpoint override.",
    "        required: false",
    "      provider-thinking:",
    "        description: Optional OpenAI-compatible thinking mode.",
    "        required: false",
    "",
    "jobs:",
    "  live-provider-smoke:",
    "    steps:",
    "      - name: Verify provider secret",
    "        env:",
    "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
    "        run: pnpm run live-provider-smoke"
  ].join("\n");
}
