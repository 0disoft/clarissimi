import assert from "node:assert/strict";
import test from "node:test";

import {
  dogfoodWorkflowContracts,
  findHighRiskSecretLines,
  packageOwnershipContract,
  packageReleasePolicy,
  requiredPackageScripts,
  requiredTestGlobs,
  validateActionManifestContract,
  validateCiWorkflowContract,
  validateCredentialedReleaseEvidence,
  validateDogfoodWorkflowContract,
  validateHostedLiveProviderWorkflowContract,
  validatePackageOwnershipContract,
  validatePackageReleasePolicy,
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
  scripts.lint = "node -e \"process.exit(1)\"";

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.lint must include oxlint . --deny-warnings.",
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

test("release readiness accepts the current package release policy", () => {
  assert.deepEqual(validatePackageReleasePolicy(createBlockedReleasePackageJson()), []);
});

test("release readiness rejects accidental public package release drift", () => {
  const packageJson = createBlockedReleasePackageJson();
  packageJson.private = false;
  packageJson.version = "0.1.0";

  assert.deepEqual(validatePackageReleasePolicy(packageJson), [
    "package.json private must remain true until release blockers are cleared.",
    "package.json version must remain 0.0.0 until release blockers are cleared."
  ]);
});

test("release readiness reports workspace package release policy drift with manifest paths", () => {
  const packageJson = createBlockedReleasePackageJson();
  packageJson.private = false;
  packageJson.version = "0.2.0";

  assert.deepEqual(validatePackageReleasePolicy(packageJson, packageReleasePolicy, "packages/cli/package.json"), [
    "packages/cli/package.json private must remain true until release blockers are cleared.",
    "packages/cli/package.json version must remain 0.0.0 until release blockers are cleared."
  ]);
});

test("release readiness accepts package ownership table coverage", () => {
  assert.deepEqual(
    validatePackageOwnershipContract(createPackageOwnershipText(), ["cli", "schemas"]),
    []
  );
});

test("release readiness rejects package ownership table drift", () => {
  const text = createPackageOwnershipText()
    .replace("| `packages/cli` | Implemented |", "| `packages/old-cli` | Implemented |")
    .replace("| `packages/schemas` | Implemented |", "| `packages/schemas` | Planned |");

  assert.deepEqual(validatePackageOwnershipContract(text, ["cli", "schemas"]), [
    `${packageOwnershipContract.path} missing Package Table entry for packages/cli.`,
    `${packageOwnershipContract.path} references missing workspace package packages/old-cli.`,
    `${packageOwnershipContract.path} Package Table entry for packages/schemas must have status Implemented.`
  ]);
});

test("release readiness accepts recorded credentialed release evidence", () => {
  assert.deepEqual(validateCredentialedReleaseEvidence(createReleaseEvidenceText()), []);
});

test("release readiness rejects missing hosted credentialed release evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run", "")
    .replace("`29018826925` passed on `2026-07-09T12:39:17Z`", "passed");

  assert.deepEqual(validateCredentialedReleaseEvidence(text), [
    "docs/ops/release.md must include Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run.",
    "docs/ops/release.md must include a numeric hosted live-provider workflow run id.",
    "docs/ops/release.md must include a hosted live-provider workflow timestamp."
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
    .replace("pnpm run lint", "pnpm run typecheck")
    .replace("pnpm run contract", "pnpm run check");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must run pnpm run release-readiness.",
    ".github/workflows/ci.yml must run pnpm run lint.",
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

test("release readiness rejects CI runtime and tool pin drift", () => {
  const text = createCiWorkflowText()
    .replace("node-version: 24", "node-version: 26")
    .replace("SSEALED_VERSION: 0.6.8", "SSEALED_VERSION: latest")
    .replace("sha256sum --check -", "true");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must include SSEALED_VERSION: 0.6.8.",
    ".github/workflows/ci.yml must include node-version: 24.",
    ".github/workflows/ci.yml must include sha256sum --check -."
  ]);
});

test("release readiness accepts dogfood workflow contracts", () => {
  assert.deepEqual(validateDogfoodWorkflowContract(createDryRunWorkflowText(), dogfoodWorkflowContracts[0]), []);
  assert.deepEqual(validateDogfoodWorkflowContract(createProposeWorkflowText(), dogfoodWorkflowContracts[1]), []);
  assert.deepEqual(validateDogfoodWorkflowContract(createStageDraftWorkflowText(), dogfoodWorkflowContracts[2]), []);
});

test("release readiness rejects dry-run dogfood write permission drift", () => {
  const text = createDryRunWorkflowText().replace("contents: read", "contents: write");

  assert.deepEqual(validateDogfoodWorkflowContract(text, dogfoodWorkflowContracts[0]), [
    ".github/workflows/clarissimi-dry-run.yml must include contents: read.",
    ".github/workflows/clarissimi-dry-run.yml must not include contents: write."
  ]);
});

test("release readiness rejects propose and stage-draft dogfood drift", () => {
  const proposeText = createProposeWorkflowText()
    .replace("mode: propose", "mode: dry-run")
    .replace("github-fixture: fixtures/github-merged-pr-approved.json", "github-fixture: fixtures/github-merged-pr-basic.json");

  assert.deepEqual(validateDogfoodWorkflowContract(proposeText, dogfoodWorkflowContracts[1]), [
    ".github/workflows/clarissimi-propose-fixture.yml must include mode: propose.",
    ".github/workflows/clarissimi-propose-fixture.yml must include github-fixture: fixtures/github-merged-pr-approved.json."
  ]);

  const stageDraftText = createStageDraftWorkflowText()
    .replace("mode: stage-draft", "mode: propose")
    .replace("test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"", "test \"${{ steps.stage.outputs.staged-file-count }}\" = \"4\"");

  assert.deepEqual(validateDogfoodWorkflowContract(stageDraftText, dogfoodWorkflowContracts[2]), [
    ".github/workflows/clarissimi-stage-draft-fixture.yml must include mode: stage-draft.",
    ".github/workflows/clarissimi-stage-draft-fixture.yml must include test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"."
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

test("release readiness rejects hosted live provider trigger, permission, and preflight drift", () => {
  const text = createHostedWorkflowText()
    .replace("  workflow_dispatch:", "  push:")
    .replace("contents: read", "contents: write")
    .replace(
      [
        "      - name: Verify provider secret",
        "        env:",
        "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
        "        run: test -n \"${CLARISSIMI_PROVIDER_TOKEN}\"",
        "",
        "      - name: Checkout repository",
        "        uses: actions/checkout@v7"
      ].join("\n"),
      [
        "      - name: Checkout repository",
        "        uses: actions/checkout@v7",
        "",
        "      - name: Verify provider secret",
        "        env:",
        "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
        "        run: test -n \"${CLARISSIMI_PROVIDER_TOKEN}\""
      ].join("\n")
    );

  assert.deepEqual(validateHostedLiveProviderWorkflowContract(text), [
    ".github/workflows/clarissimi-live-provider-smoke.yml must include workflow_dispatch:.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must include contents: read.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must not include push:.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must not include contents: write.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must keep Checkout repository after the previous release-check step."
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

function createBlockedReleasePackageJson() {
  return {
    private: packageReleasePolicy.private,
    version: packageReleasePolicy.version
  };
}

function createPackageOwnershipText() {
  return [
    "# Package Ownership",
    "",
    "## Package Table",
    "",
    "| Package | Status | Owns | Must Not Own |",
    "| --- | --- | --- | --- |",
    "| `packages/cli` | Implemented | CLI orchestration | Domain policy |",
    "| `packages/schemas` | Implemented | Shared schema vocabulary | CLI orchestration |",
    ""
  ].join("\n");
}

function createReleaseEvidenceText() {
  return [
    "Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.",
    "Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`.",
    "Current UMANS evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`.",
    "Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run",
    "`29018826925` passed on `2026-07-09T12:39:17Z` using repository secret `CLARISSIMI_PROVIDER_TOKEN`",
    "and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`."
  ].join("\n");
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
    "env:",
    "  ACTIONLINT_LINUX_AMD64_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    "  ACTIONLINT_VERSION: 1.7.12",
    "  SSEALED_VERSION: 0.6.8",
    "  YQ_LINUX_AMD64_SHA256: fa52a4e758c63d38299163fbdd1edfb4c4963247918bf9c1c5d31d84789eded4",
    "  YQ_VERSION: 4.53.3",
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
    "      - uses: actions/setup-node@v6",
    "        with:",
    "          node-version: 24",
    "      - run: corepack enable",
    "      - run: |",
    "          npm install --global \"ssealed@${SSEALED_VERSION}\"",
    "          sha256sum --check -",
    "      - run: pnpm run docs",
    "      - run: pnpm run release-readiness",
    "      - run: pnpm run lint",
    "      - run: pnpm run smoke",
    "      - run: pnpm run check",
    "      - run: pnpm run contract"
  ].join("\n");
}

function createDryRunWorkflowText() {
  return [
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "steps:",
    "  - uses: ./",
    "    with:",
    "      mode: dry-run",
    "      github-fixture: fixtures/github-merged-pr-basic.json",
    "  - run: |",
    "      test \"${{ steps.fixture.outputs.mode }}\" = \"dry-run\"",
    "      test \"${{ steps.fixture.outputs.input-source }}\" = \"github_fixture\"",
    "  - uses: ./",
    "    with:",
    "      mode: dry-run",
    "      event-path: fixtures/github-pull-request-merged-event.json",
    "  - run: |",
    "      test \"${{ steps.event.outputs.mode }}\" = \"dry-run\"",
    "      test \"${{ steps.event.outputs.input-source }}\" = \"github_event_path\""
  ].join("\n");
}

function createProposeWorkflowText() {
  return [
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: write",
    "  pull-requests: write",
    "  issues: read",
    "steps:",
    "  - uses: actions/checkout@v7",
    "    with:",
    "      fetch-depth: 0",
    "  - uses: ./",
    "    with:",
    "      mode: propose",
    "      github-fixture: fixtures/github-merged-pr-approved.json",
    "      base-branch: ${{ inputs.base-branch }}",
    "  - run: |",
    "      test \"${{ steps.propose.outputs.proposed-entry-count }}\" = \"1\"",
    "      test \"${{ steps.propose.outputs.mode }}\" = \"propose\"",
    "      test \"${{ steps.propose.outputs.approval-status }}\" = \"approved\"",
    "      test \"${{ steps.propose.outputs.staged-file-count }}\" = \"4\"",
    "      test -n \"${{ steps.propose.outputs.proposal-pull-request-url }}\""
  ].join("\n");
}

function createStageDraftWorkflowText() {
  return [
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: write",
    "  pull-requests: write",
    "  issues: read",
    "steps:",
    "  - uses: actions/checkout@v7",
    "    with:",
    "      fetch-depth: 0",
    "  - uses: ./",
    "    with:",
    "      mode: stage-draft",
    "      github-fixture: fixtures/github-merged-pr-basic.json",
    "      base-branch: ${{ inputs.base-branch }}",
    "  - run: |",
    "      test \"${{ steps.stage.outputs.proposed-entry-count }}\" = \"0\"",
    "      test \"${{ steps.stage.outputs.mode }}\" = \"stage-draft\"",
    "      test \"${{ steps.stage.outputs.approval-status }}\" = \"draft\"",
    "      test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"",
    "      test -n \"${{ steps.stage.outputs.proposal-pull-request-url }}\""
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
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  live-provider-smoke:",
    "    steps:",
    "      - name: Verify provider inputs",
    "        env:",
    "          CLARISSIMI_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "          CLARISSIMI_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "          CLARISSIMI_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        run: |",
    "          test -n \"${CLARISSIMI_PROVIDER_MODEL}\"",
    "",
    "      - name: Verify provider secret",
    "        env:",
    "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
    "        run: test -n \"${CLARISSIMI_PROVIDER_TOKEN}\"",
    "",
    "      - name: Checkout repository",
    "        uses: actions/checkout@v7",
    "",
    "      - name: Set up Node.js",
    "        uses: actions/setup-node@v6",
    "        with:",
    "          node-version: 24",
    "",
    "      - name: Enable Corepack",
    "        run: corepack enable",
    "",
    "      - name: Install dependencies",
    "        run: pnpm install --frozen-lockfile",
    "",
    "      - name: Run live provider smoke",
    "        env:",
    "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
    "          CLARISSIMI_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "          CLARISSIMI_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "          CLARISSIMI_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        run: pnpm run live-provider-smoke"
  ].join("\n");
}
