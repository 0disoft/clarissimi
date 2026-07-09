import assert from "node:assert/strict";
import test from "node:test";

import {
  findHighRiskSecretLines,
  requiredPackageScripts,
  requiredTestGlobs,
  validateActionManifestContract,
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

test("release readiness accepts the Action manifest contract", () => {
  assert.deepEqual(validateActionManifestContract(createActionManifestText()), []);
});

test("release readiness rejects Action manifest input default drift and secret inputs", () => {
  const text = createActionManifestText()
    .replace("default: propose", "default: dry-run")
    .replace("  provider-model:", "  provider-token:\n    required: false\n  provider-model:");

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml input mode must set default: propose.",
    "action.yml must not expose provider-token as an action input."
  ]);
});

test("release readiness rejects Action manifest env and command drift", () => {
  const text = createActionManifestText()
    .replace("CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}", "CLARISSIMI_PROVIDER_TOKEN: ${{ inputs.provider-token }}")
    .replace("pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build", "pnpm --dir \"$GITHUB_ACTION_PATH\" build");

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml must include env mapping CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}.",
    "action.yml must run pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build."
  ]);
});

test("release readiness scopes Action manifest input and output checks to their sections", () => {
  const missingInputMode = createActionManifestText()
    .replace("  mode:\n    required: false\n    default: propose\n", "");

  assert.deepEqual(validateActionManifestContract(missingInputMode), [
    "action.yml must define input mode."
  ]);

  const missingOutputMode = createActionManifestText()
    .replace("  mode:\n    value: ${{ steps.clarissimi.outputs.mode }}\n", "");

  assert.deepEqual(validateActionManifestContract(missingOutputMode), [
    "action.yml must define output mode."
  ]);
});

test("release readiness rejects Action manifest output value drift", () => {
  const text = createActionManifestText()
    .replace(
      "value: ${{ steps.clarissimi.outputs.proposal-pull-request-url }}",
      "value: ${{ steps.clarissimi.outputs.proposal-url }}"
    );

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml output proposal-pull-request-url must map to ${{ steps.clarissimi.outputs.proposal-pull-request-url }}."
  ]);
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

function createActionManifestText() {
  return [
    "name: Clarissimi",
    "inputs:",
    "  mode:",
    "    required: false",
    "    default: propose",
    "  event-path:",
    "    required: false",
    "  github-fixture:",
    "    required: false",
    "  base-branch:",
    "    required: false",
    "    default: main",
    "  remote-name:",
    "    required: false",
    "    default: origin",
    "  staging-dir:",
    "    required: false",
    "  provider:",
    "    required: false",
    "    default: fake",
    "  provider-model:",
    "    required: false",
    "  provider-endpoint:",
    "    required: false",
    "  provider-thinking:",
    "    required: false",
    "outputs:",
    "  draft-count:",
    "    value: ${{ steps.clarissimi.outputs.draft-count }}",
    "  proposed-entry-count:",
    "    value: ${{ steps.clarissimi.outputs.proposed-entry-count }}",
    "  skipped-entry-count:",
    "    value: ${{ steps.clarissimi.outputs.skipped-entry-count }}",
    "  mode:",
    "    value: ${{ steps.clarissimi.outputs.mode }}",
    "  input-source:",
    "    value: ${{ steps.clarissimi.outputs.input-source }}",
    "  approval-status:",
    "    value: ${{ steps.clarissimi.outputs.approval-status }}",
    "  redaction-match-count:",
    "    value: ${{ steps.clarissimi.outputs.redaction-match-count }}",
    "  staged-file-count:",
    "    value: ${{ steps.clarissimi.outputs.staged-file-count }}",
    "  proposal-branch:",
    "    value: ${{ steps.clarissimi.outputs.proposal-branch }}",
    "  proposal-commit-sha:",
    "    value: ${{ steps.clarissimi.outputs.proposal-commit-sha }}",
    "  proposal-pull-request-number:",
    "    value: ${{ steps.clarissimi.outputs.proposal-pull-request-number }}",
    "  proposal-pull-request-url:",
    "    value: ${{ steps.clarissimi.outputs.proposal-pull-request-url }}",
    "  proposal-pull-request-action:",
    "    value: ${{ steps.clarissimi.outputs.proposal-pull-request-action }}",
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Run Clarissimi",
    "      env:",
    "        GITHUB_TOKEN: ${{ (inputs.mode == 'propose' || inputs.mode == 'stage-draft') && github.token || '' }}",
    "        INPUT_MODE: ${{ inputs.mode }}",
    "        INPUT_EVENT_PATH: ${{ inputs.event-path }}",
    "        INPUT_GITHUB_FIXTURE: ${{ inputs.github-fixture }}",
    "        INPUT_BASE_BRANCH: ${{ inputs.base-branch }}",
    "        INPUT_REMOTE_NAME: ${{ inputs.remote-name }}",
    "        INPUT_STAGING_DIR: ${{ inputs.staging-dir }}",
    "        INPUT_PROVIDER: ${{ inputs.provider }}",
    "        INPUT_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "        INPUT_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "        INPUT_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}",
    "      run: |",
    "        pnpm --dir \"$GITHUB_ACTION_PATH\" install --frozen-lockfile",
    "        pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build",
    "        node \"$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js\""
  ].join("\n");
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
