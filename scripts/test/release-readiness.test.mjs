import assert from "node:assert/strict";
import test from "node:test";

import {
  dogfoodWorkflowContracts,
  findHighRiskSecretLines,
  packageOwnershipContract,
  packageReleasePolicy,
  requiredPackageScripts,
  requiredTestGlobs,
  validateAgentAssistedDraftsDocumentContract,
  validateActionContractDocumentContract,
  validateActionInputsOutputsDocumentContract,
  validateActionManifestContract,
  validateActionPermissionsDocumentContract,
  validateBackupRestoreDocumentContract,
  validateCiOperationalDocumentContract,
  validateCliCommandContract,
  validateCliConfigurationDocumentContract,
  validateCliOutputExitCodesDocumentContract,
  validateCiWorkflowContract,
  validateCredentialedReleaseEvidence,
  validateDisasterRecoveryDocumentContract,
  validateDryRunDogfoodEvidence,
  validateDogfoodWorkflowContract,
  validateDocsValidationScriptContract,
  validateEngineeringValidationDocumentContract,
  validateHostedLiveProviderWorkflowContract,
  validateHostedCiEvidence,
  validateIncidentResponseDocumentContract,
  validateLedgerFormatDocumentContract,
  validateLintAndFormatDecisionDocumentContract,
  validateMonorepoValidationDocumentContract,
  validateObservabilityDocumentContract,
  validateOpsValidationFooterContract,
  validateOperationalContractDocumentContract,
  validatePackageOwnershipContract,
  validatePackageReleasePolicy,
  validatePackageScriptRegistration,
  validateProductPositioningContract,
  validateReadmeValidationContract,
  validateReleasePolicyDocumentContract,
  validateRootPackageManager,
  validateRootTsconfigReferences,
  validateRollbackProcedureContract,
  validateSmokePackCandidateContract,
  validateServiceLevelsDocumentContract,
  validateSecretsDocumentContract,
  validateTrackedGeneratedOutputPaths,
  validateWorkspaceContract,
  validateWorkspaceInternalDependencies,
  validateWorkspacePackageManifest,
  validateWorkspacePackageManifestSurface,
  validateWorkspacePackageTsconfigReferences,
  validateWorkflowTrustBoundaryContract,
  validateWriteModeDogfoodEvidence
} from "../release-readiness.mjs";

test("release readiness accepts the current package script registration", () => {
  const packageJson = {
    scripts: createValidScripts()
  };

  assert.deepEqual(validatePackageScriptRegistration(packageJson), []);
});

test("release readiness rejects missing release-critical scripts", () => {
  const scripts = createValidScripts();
  delete scripts["hosted-external-consumer-smoke"];

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.hosted-external-consumer-smoke must be configured."
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

test("release readiness keeps deferred validations intentionally fail-closed", () => {
  const scripts = createValidScripts();

  assert.deepEqual(validatePackageScriptRegistration({ scripts }), []);
});

test("release readiness rejects fake or premature format command drift", () => {
  const fakeSuccessScripts = createValidScripts();
  fakeSuccessScripts.format = "node -e \"console.log('formatted')\"";

  assert.deepEqual(validatePackageScriptRegistration({ scripts: fakeSuccessScripts }), [
    "package.json scripts.format must include format is not configured.",
    "package.json scripts.format must include process.exit(1)."
  ]);

  const prematureFormatterScripts = createValidScripts();
  prematureFormatterScripts.format = "oxfmt --write .";

  assert.deepEqual(validatePackageScriptRegistration({ scripts: prematureFormatterScripts }), [
    "package.json scripts.format must include format is not configured.",
    "package.json scripts.format must include process.exit(1).",
    "package.json scripts.format must not use oxfmt until a formatter baseline is accepted."
  ]);
});

test("release readiness rejects fake migration-check command drift", () => {
  const scripts = createValidScripts();
  scripts["migration-check"] = "node -e \"console.log('no migrations')\"";

  assert.deepEqual(validatePackageScriptRegistration({ scripts }), [
    "package.json scripts.migration-check must include migration-check is not configured.",
    "package.json scripts.migration-check must include process.exit(1)."
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

test("release readiness accepts the root package manager contract", () => {
  assert.deepEqual(validateRootPackageManager(createRootPackageManagerPackageJson()), []);
});

test("release readiness rejects root package manager drift", () => {
  assert.deepEqual(validateRootPackageManager({ packageManager: "pnpm@latest" }), [
    "package.json packageManager must remain pnpm@11.7.0."
  ]);

  assert.deepEqual(validateRootPackageManager({ packageManager: "npm@11.7.0" }), [
    "package.json packageManager must remain pnpm@11.7.0."
  ]);

  assert.deepEqual(validateRootPackageManager({}), [
    "package.json packageManager must remain pnpm@11.7.0."
  ]);
});

test("release readiness accepts smoke package pack candidate coverage", () => {
  assert.deepEqual(validateSmokePackCandidateContract(createSmokeScriptText()), []);
});

test("release readiness rejects missing smoke package pack candidate coverage", () => {
  const text = createSmokeScriptText()
    .replace("assertWorkspacePackagePackDryRuns", "assertWorkspacePackages")
    .replace("\"README.md\",", "")
    .replace("path.startsWith(\"src/\")", "false")
    .replace(
      "{ dir: \"action\", requiredFiles: [\"dist/bin/clarissimi-action.js\"] }",
      "{ dir: \"action\" }"
    );

  assert.deepEqual(validateSmokePackCandidateContract(text), [
    "scripts/smoke.mjs must include assertWorkspacePackagePackDryRuns.",
    "scripts/smoke.mjs must include { dir: \"action\", requiredFiles: [\"dist/bin/clarissimi-action.js\"] }.",
    "scripts/smoke.mjs must include README.md.",
    "scripts/smoke.mjs must include src/."
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
    "package.json private must remain true while public package publication is blocked.",
    "package.json version must remain 0.0.0 while public package publication is blocked."
  ]);
});

test("release readiness reports workspace package release policy drift with manifest paths", () => {
  const packageJson = createBlockedReleasePackageJson();
  packageJson.private = false;
  packageJson.version = "0.2.0";

  assert.deepEqual(validatePackageReleasePolicy(packageJson, packageReleasePolicy, "packages/cli/package.json"), [
    "packages/cli/package.json private must remain true while public package publication is blocked.",
    "packages/cli/package.json version must remain 0.0.0 while public package publication is blocked."
  ]);
});

test("release readiness accepts the Action release policy document contract", () => {
  assert.deepEqual(validateReleasePolicyDocumentContract(createReleasePolicyText()), []);
});

test("release readiness rejects release policy document drift", () => {
  const text = createReleasePolicyText()
    .replace("Clarissimi is not ready for public package publication.", "Clarissimi can publish packages.")
    .replace("ADR 0031 authorizes immutable root GitHub", "No immutable release decision exists.")
    .replace("ADR 0034 authorizes moving major alias `v0`", "No alias release decision exists.")
    .replace("- Public package publication: blocked.", "- Public package publication: allowed.")
    .replace("- Versioned GitHub Action tag: allowed for immutable `v0.x.y` tags under ADR 0031", "- Versioned GitHub Action tag: moving latest.")
    .replace("- Moving GitHub Action major alias: `v0` is allowed under ADR 0034", "- Moving alias: ungoverned.")
    .replace("- GitHub Marketplace publication: blocked.", "- GitHub Marketplace publication: allowed.")
    .replace("`pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`", "")
    .replace("`pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`", "")
    .replace("## Major Alias Promotion", "## Unverified Alias Promotion")
    .replace("`pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`", "");

  assert.deepEqual(validateReleasePolicyDocumentContract(text), [
    "docs/ops/release.md must include Clarissimi is not ready for public package publication..",
    "docs/ops/release.md must include ADR 0031 authorizes immutable root GitHub.",
    "docs/ops/release.md must include ADR 0034 authorizes moving major alias `v0`.",
    "docs/ops/release.md must include - Public package publication: blocked..",
    "docs/ops/release.md must include - Versioned GitHub Action tag: allowed for immutable `v0.x.y` tags under ADR 0031.",
    "docs/ops/release.md must include - Moving GitHub Action major alias: `v0` is allowed under ADR 0034.",
    "docs/ops/release.md must include - GitHub Marketplace publication: blocked..",
    "docs/ops/release.md must include ## Major Alias Promotion.",
    "docs/ops/release.md must include `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`.",
    "docs/ops/release.md must include `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`.",
    "docs/ops/release.md must include `pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`."
  ]);
});

test("release readiness accepts the product positioning contract", () => {
  assert.deepEqual(validateProductPositioningContract(createProductPositioningTexts()), []);
});

test("release readiness rejects product positioning drift", () => {
  const texts = createProductPositioningTexts();
  texts["README.md"] = texts["README.md"]
    .replace(
      "Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories.",
      "Clarissimi is a contribution automation tool for open-source repositories."
    )
    .replace("Public output should read like contribution history, not a scoreboard.", "");
  texts["docs/product/02-spec.md"] = texts["docs/product/02-spec.md"]
    .replace("Clarissimi must be described as a contribution recognition engine.", "Clarissimi is flexible.")
    .replace("maintainer-only analytics view unless a future ADR accepts a safer public framing.", "")
    + "\nPublic output should show contributor scores.\n";

  assert.deepEqual(validateProductPositioningContract(texts), [
    "README.md must include Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories..",
    "README.md must include Public output should read like contribution history, not a scoreboard..",
    "docs/product/02-spec.md must include Clarissimi must be described as a contribution recognition engine..",
    "docs/product/02-spec.md must include maintainer-only analytics view unless a future ADR accepts a safer public framing..",
    "docs/product/02-spec.md must not include Public output should show contributor scores.."
  ]);
});

test("release readiness accepts the README validation contract", () => {
  assert.deepEqual(validateReadmeValidationContract(createReadmeValidationText()), []);
});

test("release readiness rejects README validation drift", () => {
  const text = createReadmeValidationText()
    .replace("Not implemented yet:", "Implemented now:")
    .replace("repository write modes such as direct `commit`", "repository direct commit mode")
    .replace("comment updates or default-branch mutation", "comment and default branch updates")
    .replace("Source-only merges require `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,", "Source-only merges require `pnpm run docs`,")
    .replace("Release-only hosted checks are:", "Release-only checks are:")
    .replace("- `pnpm run release-readiness`", "")
    .replace("- `pnpm run live-provider-smoke`", "")
    .replace("- `pnpm run hosted-ci-validation`", "")
    .replace("- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`", "")
    .replace("- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0 --expected-sha <commit-sha>`", "")
    .replace("- `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`", "")
    .replace("- `pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`", "")
    .replace("Release-only credentialed checks are:", "Credential checks are:")
    .replace("`format` intentionally fails closed", "`format` is optional")
    .replace("`oxlint` is", "`eslint` is")
    .replace(
      "the current lint gate; `oxfmt` is not wired into the repository formatter surface yet",
      "the current lint gate; `oxfmt` formats the repository"
    );

  assert.deepEqual(validateReadmeValidationContract(text), [
    "README.md must include Not implemented yet:.",
    "README.md must include repository write modes such as direct `commit`.",
    "README.md must include comment updates or default-branch mutation.",
    "README.md must include Source-only merges require `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,.",
    "README.md must include - `pnpm run release-readiness`.",
    "README.md must include Release-only hosted checks are:.",
    "README.md must include - `pnpm run live-provider-smoke`.",
    "README.md must include - `pnpm run hosted-ci-validation`.",
    "README.md must include - `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`.",
    "README.md must include - `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0 --expected-sha <commit-sha>`.",
    "README.md must include - `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`.",
    "README.md must include - `pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`.",
    "README.md must include Release-only credentialed checks are:.",
    "README.md must include `format` intentionally fails closed.",
    "README.md must include `oxlint` is.",
    "README.md must include the current lint gate; `oxfmt` is not wired into the repository formatter surface yet."
  ]);
});

test("release readiness accepts the docs validation script contract", () => {
  assert.deepEqual(validateDocsValidationScriptContract(createDocsValidationScriptText()), []);
});

test("release readiness rejects docs validation script drift", () => {
  const text = createDocsValidationScriptText()
    .replace("\"action.yml\"", "\"action-renamed.yml\"")
    .replace("\"docs/product/00-product-brief.md\"", "\"docs/product/00-product-brief-renamed.md\"")
    .replace("\"docs/product/02-spec.md\"", "\"docs/product/spec.md\"")
    .replace("\"docs/product/03-risk-register.md\"", "\"docs/product/risk.md\"")
    .replace("\"docs/cli/configuration.md\"", "\"docs/cli/config.md\"")
    .replace("\"docs/cli/ledger-format.md\"", "\"docs/cli/ledger.md\"")
    .replace("\"docs/github-action/README.md\"", "\"docs/github-action/GUIDE.md\"")
    .replace("\"docs/ops/incident-response.md\"", "\"docs/ops/incidents.md\"")
    .replace("\"docs/ops/release-candidate-evidence.md\"", "\"docs/ops/release-candidate.md\"")
    .replace("\"docs/ops/release.md\"", "\"docs/ops/publication.md\"")
    .replace("\"packages/renderers/README.md\"", "\"packages/renderers/README-renamed.md\"")
    .replace("\".github/workflows/clarissimi-live-provider-smoke.yml\"", "\".github/workflows/live-provider.yml\"")
    .replace("\"scripts/hosted-external-consumer-smoke.mjs\"", "\"scripts/external-consumer-smoke.mjs\"")
    .replace("\"scripts/hosted-live-provider-smoke.mjs\"", "\"scripts/hosted-provider-smoke.mjs\"")
    .replace("\"scripts/release-candidate-evidence-orchestrator.mjs\"", "\"scripts/evidence-orchestrator.mjs\"")
    .replace("\"scripts/release-candidate-evidence-issue.mjs\"", "\"scripts/evidence-issue.mjs\"")
    .replace("\"scripts/verify-action-major-tag.mjs\"", "\"scripts/major-tag-check.mjs\"");

  assert.deepEqual(validateDocsValidationScriptContract(text), [
    "scripts/validate-docs.mjs must include \"action.yml\".",
    "scripts/validate-docs.mjs must include \"docs/product/00-product-brief.md\".",
    "scripts/validate-docs.mjs must include \"docs/product/02-spec.md\".",
    "scripts/validate-docs.mjs must include \"docs/product/03-risk-register.md\".",
    "scripts/validate-docs.mjs must include \"docs/cli/configuration.md\".",
    "scripts/validate-docs.mjs must include \"docs/cli/ledger-format.md\".",
    "scripts/validate-docs.mjs must include \"docs/github-action/README.md\".",
    "scripts/validate-docs.mjs must include \"docs/ops/incident-response.md\".",
    "scripts/validate-docs.mjs must include \"docs/ops/release-candidate-evidence.md\".",
    "scripts/validate-docs.mjs must include \"docs/ops/release.md\".",
    "scripts/validate-docs.mjs must include \"packages/renderers/README.md\".",
    "scripts/validate-docs.mjs must include \".github/workflows/clarissimi-live-provider-smoke.yml\".",
    "scripts/validate-docs.mjs must include \"scripts/hosted-external-consumer-smoke.mjs\".",
    "scripts/validate-docs.mjs must include \"scripts/hosted-live-provider-smoke.mjs\".",
    "scripts/validate-docs.mjs must include \"scripts/release-candidate-evidence-orchestrator.mjs\".",
    "scripts/validate-docs.mjs must include \"scripts/release-candidate-evidence-issue.mjs\".",
    "scripts/validate-docs.mjs must include \"scripts/verify-action-major-tag.mjs\"."
  ]);
});

test("release readiness accepts the lint and format decision contract", () => {
  assert.deepEqual(validateLintAndFormatDecisionDocumentContract(createLintAndFormatDecisionText()), []);
});

test("release readiness rejects lint and format decision drift", () => {
  const text = createLintAndFormatDecisionText()
    .replace("Use `oxlint` as the first real lint gate.", "Use linting when convenient.")
    .replace("run `oxlint . --deny-warnings`", "run oxlint")
    .replace("Keep `format` intentionally unconfigured for now.", "Enable format now.")
    .replace("The placeholder must continue to fail instead of", "The placeholder may pass instead of")
    .replace("`oxfmt` is not selected as the repository formatter", "`oxfmt` is selected as the repository formatter")
    .replace("run the formatter across the selected baseline once", "run the formatter later")
    .replace("`format` remains a known gap, not a fake success.", "`format` is a fake success.");

  assert.deepEqual(validateLintAndFormatDecisionDocumentContract(text), [
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include Use `oxlint` as the first real lint gate..",
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include run `oxlint . --deny-warnings`.",
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include Keep `format` intentionally unconfigured for now..",
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include The placeholder must continue to fail instead of.",
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include `oxfmt` is not selected as the repository formatter.",
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include run the formatter across the selected baseline once.",
    "docs/adr/0027-add-lint-gate-and-defer-format-baseline.md must include `format` remains a known gap, not a fake success.."
  ]);
});

test("release readiness accepts the ledger format document contract", () => {
  assert.deepEqual(validateLedgerFormatDocumentContract(createLedgerFormatDocumentText()), []);
});

test("release readiness rejects ledger format document drift", () => {
  const text = createLedgerFormatDocumentText()
    .replace("Each non-empty line is one approved `clarissimi.assessment/v1` JSON object.", "Each line stores a contribution.")
    .replace("`source.pullRequestNumber` stores the PR number", "`source` stores event data")
    .replace("`evidenceRefs[]` stores the human-clickable PR URL", "URLs are optional metadata")
    .replace("Ledger records must not contain public contributor scores, average scores, ranks, leaderboard", "Ledger records may contain scores")
    .replace("The MVP keeps one canonical ledger file.", "The MVP uses monthly partitions.")
    .replace("Maintainer-only analytics may calculate recent recognition share from the same ledger", "Public analytics may show share")
    .replace("Public ledger records are assessment-only.", "Public ledger records may keep draft metadata.")
    .replace("They must not store AI agent, delegated model, prompt,", "They may store model names, prompts,")
    .replace("CLI draft commands sanitize public records so provenance does not", "CLI draft commands preserve provenance in public records");

  assert.deepEqual(validateLedgerFormatDocumentContract(text), [
    "docs/cli/ledger-format.md must include Each non-empty line is one approved `clarissimi.assessment/v1` JSON object..",
    "docs/cli/ledger-format.md must include `source.pullRequestNumber` stores the PR number.",
    "docs/cli/ledger-format.md must include `evidenceRefs[]` stores the human-clickable PR URL.",
    "docs/cli/ledger-format.md must include Ledger records must not contain public contributor scores, average scores, ranks, leaderboard.",
    "docs/cli/ledger-format.md must include Maintainer-only analytics may calculate recent recognition share from the same ledger.",
    "docs/cli/ledger-format.md must include Public ledger records are assessment-only..",
    "docs/cli/ledger-format.md must include They must not store AI agent, delegated model, prompt,.",
    "docs/cli/ledger-format.md must include CLI draft commands sanitize public records so provenance does not.",
    "docs/cli/ledger-format.md must include The MVP keeps one canonical ledger file."
  ]);
});

test("release readiness accepts the CLI command contract", () => {
  assert.deepEqual(validateCliCommandContract(createCliCommandContractText()), []);
});

test("release readiness rejects CLI command contract drift", () => {
  const text = createCliCommandContractText()
    .replace("Help output is informational and must not read", "Help output is informational.")
    .replace("default config files exist, the command fails closed", "default config files exist, the command picks one")
    .replace("`--provider openai-compatible`: explicit live provider path", "`--provider openai-compatible`: live provider path")
    .replace("writes files only when `--out-dir`", "writes files by default")
    .replace("accepts only `maintainerApprovalStatus: \"draft\"`", "accepts draft assessments")
    .replace("rejects non-public approval states, appends the sanitized public", "imports assessments")
    .replace("Unexpected positional arguments must fail as usage errors before config loading", "Unexpected positional arguments are ignored")
    .replace("| `7` | write failure |", "| `7` | failure |");

  assert.deepEqual(validateCliCommandContract(text), [
    "docs/cli/command-contract.md must include Help output is informational and must not read.",
    "docs/cli/command-contract.md must include default config files exist, the command fails closed.",
    "docs/cli/command-contract.md must include `--provider openai-compatible`: explicit live provider path.",
    "docs/cli/command-contract.md must include writes files only when `--out-dir`.",
    "docs/cli/command-contract.md must include accepts only `maintainerApprovalStatus: \"draft\"`.",
    "docs/cli/command-contract.md must include rejects non-public approval states, appends the sanitized public.",
    "docs/cli/command-contract.md must include Unexpected positional arguments must fail as usage errors before config loading.",
    "docs/cli/command-contract.md must include | `7` | write failure |."
  ]);
});

test("release readiness accepts the CLI output and exit codes document contract", () => {
  assert.deepEqual(validateCliOutputExitCodesDocumentContract(createCliOutputExitCodesDocumentText()), []);
});

test("release readiness rejects CLI output and exit codes drift", () => {
  const text = createCliOutputExitCodesDocumentText()
    .replace("raw provider response", "provider response")
    .replace("raw diff", "diff")
    .replace("private environment values", "environment values")
    .replace("- `1`: usage error", "- `1`: error")
    .replace("- `7`: write failure", "- `7`: failure")
    .replace(
      "Output implies a recognition entry was approved when it is only a draft.",
      "Output says recognition is approved."
    )
    .replace("JSON output leaks raw evidence.", "JSON output includes evidence.");

  assert.deepEqual(validateCliOutputExitCodesDocumentContract(text), [
    "docs/cli/output-and-exit-codes.md must include raw provider response.",
    "docs/cli/output-and-exit-codes.md must include raw diff.",
    "docs/cli/output-and-exit-codes.md must include private environment values.",
    "docs/cli/output-and-exit-codes.md must include - `1`: usage error.",
    "docs/cli/output-and-exit-codes.md must include - `7`: write failure.",
    "docs/cli/output-and-exit-codes.md must include Output implies a recognition entry was approved when it is only a draft..",
    "docs/cli/output-and-exit-codes.md must include JSON output leaks raw evidence.."
  ]);
});

test("release readiness accepts the CLI configuration document contract", () => {
  assert.deepEqual(validateCliConfigurationDocumentContract(createCliConfigurationDocumentText()), []);
});

test("release readiness rejects CLI configuration document drift", () => {
  const text = createCliConfigurationDocumentText()
    .replace("if both exist, the CLI fails closed", "if both exist, the CLI chooses one")
    .replace("The CLI owns file loading and precedence.", "The schema owns file loading.")
    .replace("explicit CLI flags", "config values")
    .replace("`provider`: `fake` or `openai-compatible`", "`provider`: any model provider")
    .replace("Provider API keys and GitHub tokens must not be stored in config files.", "Provider API keys may be stored in config files.")
    .replace("The CLI reads `CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.", "The CLI always reads provider tokens.");

  assert.deepEqual(validateCliConfigurationDocumentContract(text), [
    "docs/cli/configuration.md must include `clarissimi.config.ts` and `.clarissimi/config.json`; if both exist, the CLI fails closed.",
    "docs/cli/configuration.md must include The CLI owns file loading and precedence..",
    "docs/cli/configuration.md must include explicit CLI flags.",
    "docs/cli/configuration.md must include `provider`: `fake` or `openai-compatible`.",
    "docs/cli/configuration.md must include Provider API keys and GitHub tokens must not be stored in config files..",
    "docs/cli/configuration.md must include The CLI reads `CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.."
  ]);
});

test("release readiness accepts the agent-assisted drafts document contract", () => {
  assert.deepEqual(validateAgentAssistedDraftsDocumentContract(createAgentAssistedDraftsDocumentText()), []);
});

test("release readiness rejects agent-assisted drafts document drift", () => {
  const text = createAgentAssistedDraftsDocumentText()
    .replace("already-running AI coding agent", "external automation")
    .replace("Clarissimi a provider API key.", "Clarissimi a configured provider key.")
    .replace(
      "responsible for validating the resulting JSON, enforcing approval status, and rendering public",
      "Clarissimi accepts the result"
    )
    .replace("Public outputs must not include total score, average score, rank, leaderboard", "Public outputs may include ranking")
    .replace("`import-draft` appends only approved or auto-approved records to `.clarissimi/contributions.jsonl`.", "`import-draft` appends records.")
    .replace("The public ledger does not store AI agent, model, prompt, token, or", "The public ledger stores model data.");

  assert.deepEqual(validateAgentAssistedDraftsDocumentContract(text), [
    "docs/cli/agent-assisted-drafts.md must include already-running AI coding agent.",
    "docs/cli/agent-assisted-drafts.md must include Clarissimi a provider API key..",
    "docs/cli/agent-assisted-drafts.md must include responsible for validating the resulting JSON.",
    "docs/cli/agent-assisted-drafts.md must include enforcing approval status, and rendering public.",
    "docs/cli/agent-assisted-drafts.md must include Public outputs must not include total score, average score, rank, leaderboard.",
    "docs/cli/agent-assisted-drafts.md must include `import-draft` appends only approved or auto-approved records to `.clarissimi/contributions.jsonl`..",
    "docs/cli/agent-assisted-drafts.md must include The public ledger does not store AI agent, model, prompt, token, or."
  ]);
});

test("release readiness accepts the CI operational document contract", () => {
  assert.deepEqual(validateCiOperationalDocumentContract(createCiOperationalDocumentText()), []);
});

test("release readiness rejects CI operational document drift", () => {
  const text = createCiOperationalDocumentText()
    .replace("`lint`, `smoke`, `check`, and `contract` with Node.js 24", "`smoke`, `check`, and `contract` with Node.js 24")
    .replace("The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`", "The `main` branch is protected by maintainers")
    .replace("to pass with strict up-to-date status checks. Administrator enforcement is disabled", "with repository-owner recovery.")
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );
  const withoutHostedCiValidation = text
    .replace("`pnpm run hosted-ci-validation`", "`pnpm run hosted-live-provider-smoke`")
    .replace("uses `gh run list` to find the `CI` workflow run", "uses the GitHub UI");

  assert.deepEqual(validateCiOperationalDocumentContract(withoutHostedCiValidation), [
    "docs/ops/ci.md must include `lint`, `smoke`, `check`, and `contract` with Node.js 24.",
    "docs/ops/ci.md must include `pnpm run hosted-ci-validation`.",
    "docs/ops/ci.md must include uses `gh run list` to find the `CI` workflow run.",
    "docs/ops/ci.md must include The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`.",
    "docs/ops/ci.md must include to pass with strict up-to-date status checks. Administrator enforcement is disabled.",
    "docs/ops/ci.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the operational contract document contract", () => {
  assert.deepEqual(validateOperationalContractDocumentContract(createOperationalContractDocumentText()), []);
});

test("release readiness rejects operational contract document drift", () => {
  const text = createOperationalContractDocumentText()
    .replace(
      "Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
      "Correctness gate: `pnpm run docs`,"
    )
    .replace(
      "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges.",
      "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract` should usually pass."
    )
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateOperationalContractDocumentContract(text), [
    "docs/ops/00-operational-contract.md must include Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,.",
    "docs/ops/00-operational-contract.md must include `pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges..",
    "docs/ops/00-operational-contract.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the observability document contract", () => {
  assert.deepEqual(validateObservabilityDocumentContract(createObservabilityDocumentText()), []);
});

test("release readiness rejects observability document drift", () => {
  const text = createObservabilityDocumentText()
    .replace(
      "hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`",
      "hosted CI run status for `docs`, `smoke`, `check`, and `contract`"
    )
    .replace(
      "manual dogfood workflow run URLs for propose, stage-draft, and live-provider smoke",
      "manual dogfood workflow evidence"
    )
    .replace(
      "Maintainers should preserve workflow URLs and PR URLs in",
      "Maintainers should preserve release notes in"
    )
    .replace("- `pnpm run release-readiness`", "")
    .replace("- `pnpm run lint`", "")
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateObservabilityDocumentContract(text), [
    "docs/ops/observability.md must include hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`.",
    "docs/ops/observability.md must include manual dogfood workflow run URLs for propose, stage-draft, and live-provider smoke.",
    "docs/ops/observability.md must include Maintainers should preserve workflow URLs and PR URLs in.",
    "docs/ops/observability.md must include - `pnpm run release-readiness`.",
    "docs/ops/observability.md must include - `pnpm run lint`.",
    "docs/ops/observability.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the service levels document contract", () => {
  assert.deepEqual(validateServiceLevelsDocumentContract(createServiceLevelsDocumentText()), []);
});

test("release readiness rejects service levels document drift", () => {
  const text = createServiceLevelsDocumentText()
    .replace(
      "Source-only merge readiness | Local `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`, and hygiene checks pass before push.",
      "Source-only merge readiness | Local `docs`, `smoke`, `check`, `contract`, and hygiene checks pass before push."
    )
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateServiceLevelsDocumentContract(text), [
    "docs/ops/service-levels.md must include Source-only merge readiness | Local `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`, and hygiene checks pass before push..",
    "docs/ops/service-levels.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the secrets document contract", () => {
  assert.deepEqual(validateSecretsDocumentContract(createSecretsDocumentText()), []);
});

test("release readiness rejects secrets document drift", () => {
  const text = createSecretsDocumentText()
    .replace(
      "Rerun secret scan, `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
      "Rerun secret scan, `pnpm run docs`,"
    )
    .replace(
      "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract`.",
      "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract` when convenient."
    )
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateSecretsDocumentContract(text), [
    "docs/ops/secrets.md must include Rerun secret scan, `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,.",
    "docs/ops/secrets.md must include `pnpm run smoke`, `pnpm run check`, and `pnpm run contract`..",
    "docs/ops/secrets.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the backup and restore document contract", () => {
  assert.deepEqual(validateBackupRestoreDocumentContract(createBackupRestoreDocumentText()), []);
});

test("release readiness rejects backup and restore document drift", () => {
  const text = createBackupRestoreDocumentText()
    .replace("- `pnpm run release-readiness`", "")
    .replace("- `pnpm run lint`", "")
    .replace("secret scan for committed provider tokens, GitHub tokens, private keys, and environment files", "manual review")
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateBackupRestoreDocumentContract(text), [
    "docs/ops/backup-and-restore.md must include - `pnpm run release-readiness`.",
    "docs/ops/backup-and-restore.md must include - `pnpm run lint`.",
    "docs/ops/backup-and-restore.md must include secret scan for committed provider tokens, GitHub tokens, private keys, and environment files.",
    "docs/ops/backup-and-restore.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the incident response document contract", () => {
  assert.deepEqual(validateIncidentResponseDocumentContract(createIncidentResponseDocumentText()), []);
});

test("release readiness rejects incident response document drift", () => {
  const text = createIncidentResponseDocumentText()
    .replace("Incident response is repository-local for the MVP.", "Incident response is external.")
    .replace("| SEV-1 | Token, private key, raw provider output, raw diff, or sensitive evidence is public.", "| SEV-1 | Service outage.")
    .replace("Capture commit SHA, workflow run URL, PR URL, and local command output.", "Capture a summary.")
    .replace("Use `docs/ops/secrets.md` for credential exposure.", "Handle credentials manually.")
    .replace("Do not publish or promote a versioned Action tag while any required release gate is failing.", "Publish after maintainer approval.");

  assert.deepEqual(validateIncidentResponseDocumentContract(text), [
    "docs/ops/incident-response.md must include Incident response is repository-local for the MVP..",
    "docs/ops/incident-response.md must include | SEV-1 | Token, private key, raw provider output, raw diff, or sensitive evidence is public..",
    "docs/ops/incident-response.md must include Capture commit SHA, workflow run URL, PR URL, and local command output..",
    "docs/ops/incident-response.md must include Use `docs/ops/secrets.md` for credential exposure..",
    "docs/ops/incident-response.md must include Do not publish or promote a versioned Action tag while any required release gate is failing.."
  ]);
});

test("release readiness accepts the disaster recovery document contract", () => {
  assert.deepEqual(validateDisasterRecoveryDocumentContract(createDisasterRecoveryDocumentText()), []);
});

test("release readiness rejects disaster recovery document drift", () => {
  const text = createDisasterRecoveryDocumentText()
    .replace("Clarissimi disaster recovery covers repository-state corruption, unsafe recognition publication,", "Clarissimi disaster recovery covers hosted outages,")
    .replace("branch protection no longer requires the hosted `Validation` check", "branch protection changes")
    .replace("Stop release, publication, and dogfood workflow runs.", "Keep workflows running.")
    .replace("Revoke or rotate any exposed credential.", "Review exposed credential.")
    .replace("Preserve the failing commit SHA, workflow run URL, pull request URL, and changed file list.", "Preserve a summary.")
    .replace("Choose rollback or forward-fix using `docs/ops/rollback.md`.", "Choose a fix.");

  assert.deepEqual(validateDisasterRecoveryDocumentContract(text), [
    "docs/ops/disaster-recovery.md must include Clarissimi disaster recovery covers repository-state corruption, unsafe recognition publication,.",
    "docs/ops/disaster-recovery.md must include branch protection no longer requires the hosted `Validation` check.",
    "docs/ops/disaster-recovery.md must include Stop release, publication, and dogfood workflow runs..",
    "docs/ops/disaster-recovery.md must include Revoke or rotate any exposed credential..",
    "docs/ops/disaster-recovery.md must include Preserve the failing commit SHA, workflow run URL, pull request URL, and changed file list..",
    "docs/ops/disaster-recovery.md must include Choose rollback or forward-fix using `docs/ops/rollback.md`.."
  ]);
});

test("release readiness accepts the Action inputs and outputs document contract", () => {
  assert.deepEqual(validateActionInputsOutputsDocumentContract(createActionInputsOutputsDocumentText()), []);
});

test("release readiness rejects Action inputs and outputs document drift", () => {
  const text = createActionInputsOutputsDocumentText()
    .replace("- `mode`: `dry-run`, `propose`, `stage-draft`, or `promote-draft`, default `propose`", "- `mode`: `dry-run`")
    .replace("Provider API keys and GitHub tokens are not plain inputs.", "Provider API keys can be inputs.")
    .replace("reads `GITHUB_TOKEN` only in `propose`, `stage-draft`, and", "reads `GITHUB_TOKEN` in all modes")
    .replace(
      "`config-path` is explicit-only; the Action does not automatically discover repository config files.",
      "`config-path` can be discovered."
    )
    .replace(
      "`summary-path` is explicit-only, must be relative, and must stay inside `GITHUB_WORKSPACE`.",
      "`summary-path` can be absolute."
    )
    .replace(
      "An explicit `github-fixture` input takes precedence over the runner-provided `GITHUB_EVENT_PATH`",
      "Event path takes precedence."
    )
    .replace(
      "Outputs must not include raw provider output, raw diff text, raw issue text, tokens, private keys",
      "Outputs may include raw provider output."
    )
    .replace("raw-evidence exclusion rules as action outputs.", "summary rules.");

  assert.deepEqual(validateActionInputsOutputsDocumentContract(text), [
    "docs/github-action/inputs-and-outputs.md must include - `mode`: `dry-run`, `propose`, `stage-draft`, or `promote-draft`, default `propose`.",
    "docs/github-action/inputs-and-outputs.md must include Provider API keys and GitHub tokens are not plain inputs..",
    "docs/github-action/inputs-and-outputs.md must include reads `GITHUB_TOKEN` only in `propose`, `stage-draft`, and.",
    "docs/github-action/inputs-and-outputs.md must include `config-path` is explicit-only; the Action does not automatically discover repository config files..",
    "docs/github-action/inputs-and-outputs.md must include `summary-path` is explicit-only, must be relative, and must stay inside `GITHUB_WORKSPACE`..",
    "docs/github-action/inputs-and-outputs.md must include An explicit `github-fixture` input takes precedence over the runner-provided `GITHUB_EVENT_PATH`.",
    "docs/github-action/inputs-and-outputs.md must include Outputs must not include raw provider output, raw diff text, raw issue text, tokens, private keys.",
    "docs/github-action/inputs-and-outputs.md must include raw-evidence exclusion rules as action outputs.."
  ]);
});

test("release readiness accepts the Action contract document contract", () => {
  assert.deepEqual(validateActionContractDocumentContract(createActionContractDocumentText()), []);
});

test("release readiness rejects Action contract document drift", () => {
  const text = createActionContractDocumentText()
    .replace("The Action supports dry-run summaries, public recognition proposals, and draft inbox proposals.", "The Action supports recognition automation.")
    .replace("Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.", "Secret values may be action inputs.")
    .replace("Unsupported `INPUT_MODE` values must fail", "Unsupported `INPUT_MODE` values are ignored")
    .replace("Invalid summary paths fail before provider", "Invalid summary paths are normalized after provider")
    .replace("Normal provider drafts remain non-public and fail closed", "Normal provider drafts can be proposed")
    .replace("It must not write `.clarissimi/contributions.jsonl`,", "It may write `.clarissimi/contributions.jsonl`,")
    .replace("Proposal branch commits use a Clarissimi-owned bot author", "Proposal branch commits use runner identity")
    .replace("Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details.", "Outputs may include raw provider responses.")
    .replace("- Missing input source: exit `1`, empty stdout, usage message on stderr.", "- Missing input source: exit `0`.")
    .replace("Dry-run mode should need read permissions only.", "Dry-run mode needs write permissions.")
    .replace("- Provider secrets are modeled as plain action inputs.", "- Secrets are accepted as action inputs.");

  assert.deepEqual(validateActionContractDocumentContract(text), [
    "docs/github-action/action-contract.md must include The Action supports dry-run summaries, public recognition proposals, and draft inbox proposals..",
    "docs/github-action/action-contract.md must include Secret values must be read from GitHub Actions secrets or environment variables, not action inputs..",
    "docs/github-action/action-contract.md must include Unsupported `INPUT_MODE` values must fail.",
    "docs/github-action/action-contract.md must include Invalid summary paths fail before provider.",
    "docs/github-action/action-contract.md must include Normal provider drafts remain non-public and fail closed.",
    "docs/github-action/action-contract.md must include It must not write `.clarissimi/contributions.jsonl`,.",
    "docs/github-action/action-contract.md must include Proposal branch commits use a Clarissimi-owned bot author.",
    "docs/github-action/action-contract.md must include Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details..",
    "docs/github-action/action-contract.md must include - Missing input source: exit `1`, empty stdout, usage message on stderr..",
    "docs/github-action/action-contract.md must include Dry-run mode should need read permissions only..",
    "docs/github-action/action-contract.md must include - Provider secrets are modeled as plain action inputs.."
  ]);
});

test("release readiness accepts the Action permissions document contract", () => {
  assert.deepEqual(validateActionPermissionsDocumentContract(createActionPermissionsDocumentText()), []);
});

test("release readiness rejects Action permissions document drift", () => {
  const text = createActionPermissionsDocumentText()
    .replace("Clarissimi should request the narrowest permissions required for the selected mode.", "Clarissimi can request broad permissions.")
    .replace("A workflow must not use `write-all`.", "A workflow may use `write-all`.")
    .replace("| `dry-run` | `read` | `read` | `read` | No | No |", "| `dry-run` | `write` | `write` | `read` | Yes | Yes |")
    .replace("Dry-run mode should not write recognition files, branches, comments, or pull requests.", "Dry-run mode can update branches.")
    .replace("Do not document `pull_request_target`", "Document `pull_request_target`")
    .replace("instead of falling back to direct commits or broader credentials.", "or fall back to direct commits.")
    .replace("Stage-draft mode writes only a sanitized draft inbox file", "Stage-draft mode writes public recognition files")
    .replace("Commit mode requires explicit configuration and should not be the default.", "Commit mode can be the default.")
    .replace("Do not checkout or execute untrusted pull request head", "Checkout untrusted pull request head")
    .replace("Secrets are exposed to untrusted fork code.", "Secrets are safe in untrusted fork code.");

  assert.deepEqual(validateActionPermissionsDocumentContract(text), [
    "docs/github-action/permissions.md must include Clarissimi should request the narrowest permissions required for the selected mode..",
    "docs/github-action/permissions.md must include A workflow must not use `write-all`..",
    "docs/github-action/permissions.md must include | `dry-run` | `read` | `read` | `read` | No | No |.",
    "docs/github-action/permissions.md must include Dry-run mode should not write recognition files, branches, comments, or pull requests..",
    "docs/github-action/permissions.md must include Do not document `pull_request_target`.",
    "docs/github-action/permissions.md must include instead of falling back to direct commits or broader credentials..",
    "docs/github-action/permissions.md must include Stage-draft mode writes only a sanitized draft inbox file.",
    "docs/github-action/permissions.md must include Commit mode requires explicit configuration and should not be the default..",
    "docs/github-action/permissions.md must include Do not checkout or execute untrusted pull request head.",
    "docs/github-action/permissions.md must include Secrets are exposed to untrusted fork code.."
  ]);
});

test("release readiness accepts ops validation footer contracts", () => {
  assert.deepEqual(validateOpsValidationFooterContract(createOpsValidationFooterTexts()), []);
});

test("release readiness rejects ops validation footer drift", () => {
  const texts = createOpsValidationFooterTexts();
  texts["docs/ops/incident-response.md"] = texts["docs/ops/incident-response.md"].replace(
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    "- Required validation names: `docs`, `smoke`, `check`, `contract`"
  );
  delete texts["docs/ops/rollback.md"];

  assert.deepEqual(validateOpsValidationFooterContract(texts), [
    "docs/ops/incident-response.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`.",
    "docs/ops/rollback.md must be readable for ops validation footer contract."
  ]);
});

test("release readiness accepts engineering validation document contracts", () => {
  assert.deepEqual(validateEngineeringValidationDocumentContract(createEngineeringValidationDocumentTexts()), []);
});

test("release readiness rejects engineering validation document drift", () => {
  const texts = createEngineeringValidationDocumentTexts();
  texts["docs/engineering/03-performance-budget.md"] = texts["docs/engineering/03-performance-budget.md"].replace(
    "Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "Merge-blocking validation: `pnpm run lint`,"
  );
  texts["docs/engineering/04-security-baseline.md"] = texts["docs/engineering/04-security-baseline.md"].replace(
    "  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`",
    "  `pnpm run check`, `pnpm run contract`"
  );
  delete texts["docs/engineering/09-data-integrity.md"];

  assert.deepEqual(validateEngineeringValidationDocumentContract(texts), [
    "docs/engineering/03-performance-budget.md must include Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,.",
    "docs/engineering/04-security-baseline.md must include `pnpm run smoke`, `pnpm run check`, `pnpm run contract`.",
    "docs/engineering/09-data-integrity.md must be readable for engineering validation document contract."
  ]);
});

test("release readiness accepts monorepo validation document contracts", () => {
  assert.deepEqual(validateMonorepoValidationDocumentContract(createMonorepoValidationDocumentTexts()), []);
});

test("release readiness rejects monorepo validation document drift", () => {
  const texts = createMonorepoValidationDocumentTexts();
  texts["docs/monorepo/change-coordination.md"] = texts["docs/monorepo/change-coordination.md"]
    .replace("`release-readiness`, ", "")
    .replace("`lint`, ", "");
  delete texts["docs/monorepo/workspace-boundaries.md"];

  assert.deepEqual(validateMonorepoValidationDocumentContract(texts), [
    "docs/monorepo/change-coordination.md must include release-readiness.",
    "docs/monorepo/change-coordination.md must include lint.",
    "docs/monorepo/workspace-boundaries.md must be readable for monorepo validation document contract."
  ]);
});

test("release readiness accepts workspace contract and package manifest identity", () => {
  assert.deepEqual(validateWorkspaceContract('packages:\n  - "packages/*"\nallowBuilds:\n  esbuild: true\n'), []);
  assert.deepEqual(
    validateWorkspacePackageManifest(
      {
        name: "@clarissimi/cli",
        type: "module"
      },
      "cli",
      "packages/cli/package.json"
    ),
    []
  );
});

test("release readiness rejects workspace and package manifest identity drift", () => {
  assert.deepEqual(validateWorkspaceContract("packages:\n  - apps/*\n"), [
    'pnpm-workspace.yaml must include workspace package glob "packages/*".',
    "pnpm-workspace.yaml must explicitly allow the pinned esbuild install script."
  ]);

  assert.deepEqual(
    validateWorkspacePackageManifest(
      {
        name: "@clarissimi/renamed-cli",
        type: "commonjs"
      },
      "cli",
      "packages/cli/package.json"
    ),
    [
      "packages/cli/package.json name must be @clarissimi/cli.",
      "packages/cli/package.json type must remain module."
    ]
  );
});

test("release readiness accepts workspace package manifest publish surfaces", () => {
  assert.deepEqual(
    validateWorkspacePackageManifestSurface(createWorkspacePackageManifest(), "schemas", "packages/schemas/package.json"),
    []
  );

  assert.deepEqual(
    validateWorkspacePackageManifestSurface(
      {
        ...createWorkspacePackageManifest("cli"),
        bin: {
          clarissimi: "./dist/bin/clarissimi.js"
        }
      },
      "cli",
      "packages/cli/package.json"
    ),
    []
  );
});

test("release readiness rejects workspace package manifest publish surface drift", () => {
  const packageJson = {
    ...createWorkspacePackageManifest(),
    main: "./src/index.ts",
    types: "./dist/renamed.d.ts",
    exports: {
      ".": {
        types: "./dist/renamed.d.ts",
        default: "./dist/renamed.js"
      }
    },
    files: ["dist", "src"],
    license: "UNLICENSED",
    repository: {
      type: "git",
      url: "https://example.invalid/clarissimi.git"
    },
    homepage: "https://example.invalid/clarissimi",
    bugs: {
      url: "https://example.invalid/bugs"
    },
    engines: {
      node: ">=20"
    },
    scripts: {
      build: "tsc",
      typecheck: "tsc --noEmit"
    },
    bin: {
      extra: "./dist/bin/extra.js"
    }
  };

  assert.deepEqual(
    validateWorkspacePackageManifestSurface(packageJson, "schemas", "packages/schemas/package.json"),
    [
      "packages/schemas/package.json main must remain ./dist/index.js.",
      "packages/schemas/package.json types must remain ./dist/index.d.ts.",
      "packages/schemas/package.json exports[\".\"].types must remain ./dist/index.d.ts.",
      "packages/schemas/package.json exports[\".\"].default must remain ./dist/index.js.",
      "packages/schemas/package.json files must remain [\"dist\"].",
      "packages/schemas/package.json license must remain Apache-2.0.",
      "packages/schemas/package.json repository metadata must point at packages/schemas.",
      "packages/schemas/package.json homepage must remain https://github.com/0disoft/clarissimi#readme.",
      "packages/schemas/package.json bugs metadata must remain {\"url\":\"https://github.com/0disoft/clarissimi/issues\"}.",
      "packages/schemas/package.json engines must remain {\"node\":\">=24\"}.",
      "packages/schemas/package.json scripts.build must remain tsc -b.",
      "packages/schemas/package.json scripts.typecheck must remain tsc -b --pretty false.",
      "packages/schemas/package.json must not expose package bin entries."
    ]
  );

  assert.deepEqual(
    validateWorkspacePackageManifestSurface(createWorkspacePackageManifest("cli"), "cli", "packages/cli/package.json"),
    [
      "packages/cli/package.json bin must remain {\"clarissimi\":\"./dist/bin/clarissimi.js\"}."
    ]
  );
});

test("release readiness accepts the internal workspace dependency graph", () => {
  assert.deepEqual(
    validateWorkspaceInternalDependencies(
      {
        dependencies: {
          "@clarissimi/core": "workspace:*",
          "@clarissimi/github": "workspace:*",
          "@clarissimi/providers": "workspace:*",
          "@clarissimi/renderers": "workspace:*",
          "@clarissimi/schemas": "workspace:*"
        }
      },
      "cli",
      "packages/cli/package.json"
    ),
    []
  );

  assert.deepEqual(
    validateWorkspaceInternalDependencies(
      {},
      "schemas",
      "packages/schemas/package.json"
    ),
    []
  );
});

test("release readiness rejects internal workspace dependency drift", () => {
  assert.deepEqual(
    validateWorkspaceInternalDependencies(
      {
        dependencies: {
          "@clarissimi/core": "workspace:^",
          "@clarissimi/renderers": "workspace:*"
        },
        devDependencies: {
          "@clarissimi/schemas": "workspace:*"
        }
      },
      "providers",
      "packages/providers/package.json"
    ),
    [
      "packages/providers/package.json dependencies must include @clarissimi/schemas: workspace:*.",
      "packages/providers/package.json dependency @clarissimi/core must use workspace:*.",
      "packages/providers/package.json dependencies must not include undeclared internal dependency @clarissimi/renderers.",
      "packages/providers/package.json devDependencies must not declare internal dependency @clarissimi/schemas; use dependencies."
    ]
  );
});

test("release readiness accepts the TypeScript build graph", () => {
  assert.deepEqual(
    validateRootTsconfigReferences(
      {
        references: [
          { path: "./packages/schemas" },
          { path: "./packages/cli" }
        ]
      },
      ["cli", "schemas"]
    ),
    []
  );

  assert.deepEqual(
    validateWorkspacePackageTsconfigReferences(
      {
        compilerOptions: {
          composite: true
        },
        references: [
          { path: "../schemas" },
          { path: "../core" }
        ]
      },
      "providers",
      "packages/providers/tsconfig.json"
    ),
    []
  );

  assert.deepEqual(
    validateWorkspacePackageTsconfigReferences(
      {
        compilerOptions: {
          composite: true
        }
      },
      "schemas",
      "packages/schemas/tsconfig.json"
    ),
    []
  );
});

test("release readiness rejects TypeScript build graph drift", () => {
  assert.deepEqual(
    validateRootTsconfigReferences(
      {
        references: [
          { path: "./packages/schemas" },
          { path: "./packages/old-cli" }
        ]
      },
      ["cli", "schemas"]
    ),
    [
      "tsconfig.json references must include ./packages/cli.",
      "tsconfig.json references must not include undeclared project reference ./packages/old-cli."
    ]
  );

  assert.deepEqual(
    validateWorkspacePackageTsconfigReferences(
      {
        compilerOptions: {
          composite: false
        },
        references: [
          { path: "../core" },
          { path: "../renderers" }
        ]
      },
      "providers",
      "packages/providers/tsconfig.json"
    ),
    [
      "packages/providers/tsconfig.json compilerOptions.composite must remain true for TypeScript project references.",
      "packages/providers/tsconfig.json references must include ../schemas.",
      "packages/providers/tsconfig.json references must not include undeclared project reference ../renderers."
    ]
  );
});

test("release readiness rejects tracked generated output paths", () => {
  assert.deepEqual(
    validateTrackedGeneratedOutputPaths([
      "README.md",
      "packages/cli/src/index.ts",
      "packages/cli/dist/index.js",
      "packages/core/tsconfig.tsbuildinfo",
      "coverage/report.json",
      "node_modules/example/index.js"
    ]),
    [
      "tracked generated output must not include packages/cli/dist/index.js.",
      "tracked generated output must not include packages/core/tsconfig.tsbuildinfo.",
      "tracked generated output must not include coverage/report.json.",
      "tracked generated output must not include node_modules/example/index.js."
    ]
  );
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

test("release readiness rejects package ownership ADR reference drift", () => {
  const text = createPackageOwnershipText()
    .replace("  docs/adr/0029-add-explicit-action-config-path.md,\n", "");

  assert.deepEqual(validatePackageOwnershipContract(text, ["cli", "schemas"]), [
    `${packageOwnershipContract.path} must include related ADR docs/adr/0029-add-explicit-action-config-path.md.`
  ]);
});

test("release readiness accepts recorded credentialed release evidence", () => {
  assert.deepEqual(validateCredentialedReleaseEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts recorded write-mode dogfood evidence", () => {
  assert.deepEqual(validateWriteModeDogfoodEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts recorded dry-run dogfood evidence", () => {
  assert.deepEqual(validateDryRunDogfoodEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts recorded hosted CI evidence", () => {
  assert.deepEqual(validateHostedCiEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts rollback procedure coverage", () => {
  assert.deepEqual(validateRollbackProcedureContract(createRollbackProcedureText()), []);
});

test("release readiness rejects missing rollback procedure coverage", () => {
  const text = createRollbackProcedureText()
    .replace("`pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`, `pnpm run smoke`,", "`pnpm run docs`,")
    .replace("`pnpm run check`, `pnpm run contract`, `actionlint`, `ssealed doctor . --json`, YAML parsing,", "`pnpm run check`,")
    .replace("Delete the temporary staging directory.", "Clean up temporary files.")
    .replace("Close the proposal pull request and delete the proposal branch.", "Resolve the proposal.")
    .replace("`pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`", "")
    .replace("do not delete broad `clarissimi/*` patterns", "delete matching branches")
    .replace("Revert the recognition pull request", "Undo the recognition change")
    .replace("Published Action tag with a normal defect", "Published tag")
    .replace("do not move or overwrite the existing tag.", "Move the tag.")
    .replace("No database rollback exists in the MVP.", "Database rollback is TBD.");

  assert.deepEqual(validateRollbackProcedureContract(text), [
    "docs/ops/rollback.md must include `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`, `pnpm run smoke`,.",
    "docs/ops/rollback.md must include `pnpm run check`, `pnpm run contract`, `actionlint`, `ssealed doctor . --json`, YAML parsing,.",
    "docs/ops/rollback.md must include Delete the temporary staging directory..",
    "docs/ops/rollback.md must include Close the proposal pull request and delete the proposal branch..",
    "docs/ops/rollback.md must include `pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`.",
    "docs/ops/rollback.md must include do not delete broad `clarissimi/*` patterns.",
    "docs/ops/rollback.md must include Revert the recognition pull request.",
    "docs/ops/rollback.md must include Published Action tag with a normal defect.",
    "docs/ops/rollback.md must include do not move or overwrite the existing tag..",
    "docs/ops/rollback.md must include No database rollback exists in the MVP.."
  ]);
});

test("release readiness rejects missing hosted credentialed release evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run", "")
    .replace("`29052452214` passed on `2026-07-09T21:45:58Z`", "passed")
    .replace("validated source commit", "source")
    .replace("`eaf22e44f5ef87391a16cf5a6597395826f05b7d`", "`not-a-sha`")
    .replace("https://github.com/0disoft/clarissimi/actions/runs/29052452214", "")
    .replace("Refresh this evidence with", "")
    .replace(
      "`pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact release-candidate commit",
      ""
    );

  assert.deepEqual(validateCredentialedReleaseEvidence(text), [
    "docs/ops/release.md must include Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run.",
    "docs/ops/release.md must include `pnpm run hosted-live-provider-smoke -- --model <provider-model>`.",
    "docs/ops/release.md must include a numeric hosted live-provider workflow run id.",
    "docs/ops/release.md must include a hosted live-provider workflow timestamp.",
    "docs/ops/release.md must include a hosted live-provider validated source commit SHA.",
    "docs/ops/release.md must include a hosted live-provider workflow run URL.",
    "docs/ops/release.md must include a hosted live-provider release-candidate refresh command."
  ]);
});

test("release readiness rejects missing write-mode dogfood evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Current dogfood evidence: `Clarissimi propose fixture` workflow run", "")
    .replace("`29027800039` passed on `2026-07-09T15:02:15Z`", "passed")
    .replace("https://github.com/0disoft/clarissimi/actions/runs/29027800039", "")
    .replace("https://github.com/0disoft/clarissimi/actions/runs/29027802451", "")
    .replace("https://github.com/0disoft/clarissimi/pull/2", "")
    .replace("pull request `#1` was closed after evidence capture", "")
    .replace("pull request `#2` was closed after evidence capture", "")
    .replace("clarissimi/recognition/merged_pull_request-42", "")
    .replace("not intended to merge into the real repository ledger", "");

  assert.deepEqual(validateWriteModeDogfoodEvidence(text), [
    "docs/ops/release.md must include Current dogfood evidence: `Clarissimi propose fixture` workflow run.",
    "docs/ops/release.md must include https://github.com/0disoft/clarissimi/actions/runs/29027800039.",
    "docs/ops/release.md must include https://github.com/0disoft/clarissimi/actions/runs/29027802451.",
    "docs/ops/release.md must include https://github.com/0disoft/clarissimi/pull/2.",
    "docs/ops/release.md must include pull request `#1` was closed after evidence capture.",
    "docs/ops/release.md must include pull request `#2` was closed after evidence capture.",
    "docs/ops/release.md must include clarissimi/recognition/merged_pull_request-42.",
    "docs/ops/release.md must include not intended to merge into the real repository ledger.",
    "docs/ops/release.md must include a numeric propose fixture workflow run id.",
    "docs/ops/release.md must include a propose fixture workflow timestamp."
  ]);
});

test("release readiness rejects missing dry-run dogfood evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Current dry-run dogfood evidence: `Clarissimi dry run` workflow run", "")
    .replace("`29031384775` passed on `2026-07-09T15:54:58Z`", "passed")
    .replace("summary artifact validation", "summary output check")
    .replace("https://github.com/0disoft/clarissimi/actions/runs/29031384775", "");

  assert.deepEqual(validateDryRunDogfoodEvidence(text), [
    "docs/ops/release.md must include Current dry-run dogfood evidence: `Clarissimi dry run` workflow run.",
    "docs/ops/release.md must include summary artifact validation.",
    "docs/ops/release.md must include https://github.com/0disoft/clarissimi/actions/runs/29031384775.",
    "docs/ops/release.md must include a numeric dry-run dogfood workflow run id.",
    "docs/ops/release.md must include a dry-run dogfood workflow timestamp."
  ]);
});

test("release readiness rejects missing hosted CI evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Recent hosted CI validation evidence: `CI` workflow run", "")
    .replace("`29052254866` passed on `2026-07-09T21:42:23Z`", "passed")
    .replace("validated source commit", "candidate")
    .replace("`eaf22e44f5ef87391a16cf5a6597395826f05b7d`", "`not-a-sha`")
    .replace("https://github.com/0disoft/clarissimi/actions/runs/29052254866", "")
    .replace("Refresh this evidence with", "")
    .replace("`pnpm run hosted-ci-validation` for the exact release-candidate commit", "");

  assert.deepEqual(validateHostedCiEvidence(text), [
    "docs/ops/release.md must include Recent hosted CI validation evidence: `CI` workflow run.",
    "docs/ops/release.md must include `pnpm run hosted-ci-validation` for the exact release-candidate commit.",
    "docs/ops/release.md must include a numeric hosted CI workflow run id.",
    "docs/ops/release.md must include a hosted CI workflow timestamp.",
    "docs/ops/release.md must include a hosted CI validated source commit sha.",
    "docs/ops/release.md must include a direct hosted CI workflow run URL."
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
    .replace("node \"$GITHUB_ACTION_PATH/action-dist/index.js\"", "node \"$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js\"");

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml must include env mapping CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}.",
    "action.yml must run node \"$GITHUB_ACTION_PATH/action-dist/index.js\".",
    "action.yml must not run node \"$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js\"."
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

test("release readiness accepts safe workflow trust boundaries", () => {
  assert.deepEqual(
    validateWorkflowTrustBoundaryContract(createCiWorkflowText(), ".github/workflows/ci.yml"),
    []
  );
});

test("release readiness rejects pull_request_target and broad workflow permissions", () => {
  const text = [
    "name: Risky",
    "on:",
    "  pull_request_target:",
    "permissions: write-all",
    ""
  ].join("\n");

  assert.deepEqual(validateWorkflowTrustBoundaryContract(text, ".github/workflows/risky.yml"), [
    ".github/workflows/risky.yml must not include pull_request_target:.",
    ".github/workflows/risky.yml must not include write-all."
  ]);
});

test("release readiness rejects workflows without explicit permissions", () => {
  const text = [
    "name: Missing permissions",
    "on:",
    "  workflow_dispatch:",
    "jobs:",
    "  validation:",
    "    runs-on: ubuntu-latest",
    ""
  ].join("\n");

  assert.deepEqual(validateWorkflowTrustBoundaryContract(text, ".github/workflows/missing-permissions.yml"), [
    ".github/workflows/missing-permissions.yml must include permissions:."
  ]);
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
    format: "node -e \"console.error('format is not configured. Configure this validation before relying on pnpm run format.'); process.exit(1)\"",
    "migration-check": "node -e \"console.error('migration-check is not configured. Configure this validation before relying on pnpm run migration-check.'); process.exit(1)\"",
    test: `node --test ${requiredTestGlobs.join(" ")}`
  };

  for (const script of requiredPackageScripts) {
    scripts[script.name] = script.includes.join(" && ");
  }

  scripts.check = "pnpm run typecheck && pnpm run test";
  scripts.contract = "pnpm run typecheck && pnpm run test";

  return scripts;
}

function createSmokeScriptText() {
  return [
    "async function assertWorkspacePackagePackDryRuns() {",
    "  const packages = [",
    "    { dir: \"schemas\" },",
    "    { dir: \"redaction\" },",
    "    { dir: \"core\" },",
    "    { dir: \"github\" },",
    "    { dir: \"providers\" },",
    "    { dir: \"renderers\" },",
    "    { dir: \"cli\", requiredFiles: [\"dist/bin/clarissimi.js\"] },",
    "    { dir: \"action\", requiredFiles: [\"dist/bin/clarissimi-action.js\"] }",
    "  ];",
    "  await runJsonCommand({",
    "    command: \"pnpm\",",
    "    args: [\"--filter\", \"@clarissimi/schemas\", \"pack\", \"--dry-run\", \"--json\"]",
    "  });",
    "}",
    "function validatePackagePackDryRun(output, packageInfo) {",
    "  const requiredFiles = [",
    "    \"package.json\",",
    "    \"README.md\",",
    "    \"LICENSE\",",
    "    \"dist/index.js\",",
    "    \"dist/index.d.ts\"",
    "  ];",
    "  if (",
    "    path === \"tsconfig.json\"",
    "    || path.startsWith(\"src/\")",
    "    || path.startsWith(\"test/\")",
    "    || path.includes(\"node_modules/\")",
    "    || path.endsWith(\".tsbuildinfo\")",
    "  ) {",
    "    throw new Error(\"bad pack file\");",
    "  }",
    "}",
    ""
  ].join("\n");
}

function createBlockedReleasePackageJson() {
  return {
    private: packageReleasePolicy.private,
    version: packageReleasePolicy.version
  };
}

function createRootPackageManagerPackageJson() {
  return {
    packageManager: "pnpm@11.7.0"
  };
}

function createReleasePolicyText() {
  return [
    "Clarissimi is not ready for public package publication.",
    "ADR 0031 authorizes immutable root GitHub",
    "ADR 0034 authorizes moving major alias `v0`",
    "The current root and workspace packages stay private at `0.0.0`.",
    "Do not bump package versions,",
    "create another moving major alias",
    "",
    "Source-only merge: allowed after `pnpm run docs`, `pnpm run release-readiness`,",
    "`pnpm run lint`, `pnpm run smoke`, `pnpm run check`, `pnpm run contract`, and repository hygiene",
    "",
    "- Public package publication: blocked.",
    "- Versioned GitHub Action tag: allowed for immutable `v0.x.y` tags under ADR 0031",
    "- Moving GitHub Action major alias: `v0` is allowed under ADR 0034",
    "- GitHub Marketplace publication: blocked.",
    "",
    "The versioned Action tag requires:",
    "Public package publication remains blocked even when every technical gate above passes.",
    "## First Action Release Procedure",
    "release type `versioned-action-tag`",
    "## Major Alias Promotion",
    "`pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`",
    "publish a corrective patch tag such as `v0.1.1`",
    "`pnpm run hosted-ci-validation`",
    "`pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`",
    "`pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`",
    "`pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`",
    "release PR, release issue, or GitHub release notes",
    "Do not make an evidence-only commit after final candidate validation",
    "docs/ops/release-candidate-evidence.md",
    "public product-positioning guardrails",
    "intentionally fail-closed `format` and `migration-check`",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    "",
    "- Release status: immutable `v0.x.y` Action tags are allowed by ADR 0031",
    "package publication and GitHub Marketplace publication remain blocked",
    ""
  ].join("\n");
}

function createProductPositioningTexts() {
  return {
    "README.md": [
      "Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories.",
      "Clarissimi is not a contributor scoring leaderboard, an HR scorecard, or an AI code review tool.",
      "AI is used as a drafter that reads repository evidence and prepares a structured recognition draft.",
      "Maintainers remain the approval authority.",
      "Public output should read like contribution history, not a scoreboard.",
      ""
    ].join("\n"),
    "docs/product/02-spec.md": [
      "Clarissimi must be described as a contribution recognition engine.",
      "Do not describe it as:",
      "- contributor scoring",
      "- contributor ranking",
      "- a public leaderboard",
      "Public output must not show a contributor's percentage share of recent total impact weight, score,",
      "Clarissimi may expose this kind of metric only through a",
      "maintainer-only analytics view unless a future ADR accepts a safer public framing.",
      ""
    ].join("\n")
  };
}

function createReadmeValidationText() {
  return [
    "Not implemented yet:",
    "",
    "- repository write modes such as direct `commit`",
    "- comment updates or default-branch mutation",
    "",
    "Source-only merges require `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract`, plus repository hygiene checks.",
    "",
    "- `pnpm run docs`",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- `pnpm run smoke`",
    "- `pnpm run check`",
    "- `pnpm run contract`",
    "Release-only hosted checks are:",
    "",
    "- `pnpm run hosted-ci-validation`",
    "- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`",
    "- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0 --expected-sha <commit-sha>`",
    "- `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`",
    "- `pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`",
    "",
    "Release-only credentialed checks are:",
    "",
    "- `pnpm run live-provider-smoke`",
    "- `pnpm run hosted-live-provider-smoke -- --model <provider-model>`",
    "",
    "`format` intentionally fails closed until maintainers accept a formatter baseline ADR. `oxlint` is",
    "the current lint gate; `oxfmt` is not wired into the repository formatter surface yet.",
    "`migration-check` intentionally fails until configured.",
    ""
  ].join("\n");
}

function createDocsValidationScriptText() {
  return [
    "export const requiredDocumentationPaths = [",
    "  \"README.md\",",
    "  \"action.yml\",",
    "  \"VALIDATION.md\",",
    "  \"docs/product/00-product-brief.md\",",
    "  \"docs/product/01-roadmap.md\",",
    "  \"docs/product/02-spec.md\",",
    "  \"docs/product/03-risk-register.md\",",
    "  \"docs/cli/README.md\",",
    "  \"docs/cli/agent-assisted-drafts.md\",",
    "  \"docs/cli/configuration.md\",",
    "  \"docs/cli/ledger-format.md\",",
    "  \"docs/cli/output-and-exit-codes.md\",",
    "  \"docs/product/04-implementation-tracker.md\",",
    "  \"docs/github-action/README.md\",",
    "  \"docs/github-action/action-contract.md\",",
    "  \"docs/github-action/permissions.md\",",
    "  \"docs/ops/ci.md\",",
    "  \"docs/ops/disaster-recovery.md\",",
    "  \"docs/ops/incident-response.md\",",
    "  \"docs/ops/release-candidate-evidence.md\",",
    "  \"docs/ops/release.md\",",
    "  \"docs/ops/rollback.md\",",
    "  \"packages/action/README.md\",",
    "  \"packages/cli/README.md\",",
    "  \"packages/core/README.md\",",
    "  \"packages/github/README.md\",",
    "  \"packages/providers/README.md\",",
    "  \"packages/redaction/README.md\",",
    "  \"packages/renderers/README.md\",",
    "  \"packages/schemas/README.md\",",
    "  \".github/workflows/ci.yml\",",
    "  \".github/workflows/clarissimi-dry-run.yml\",",
    "  \".github/workflows/clarissimi-live-provider-smoke.yml\",",
    "  \".github/workflows/clarissimi-propose-fixture.yml\",",
    "  \".github/workflows/clarissimi-stage-draft-fixture.yml\",",
    "  \"scripts/hosted-external-consumer-smoke.mjs\",",
    "  \"scripts/hosted-live-provider-smoke.mjs\",",
    "  \"scripts/release-candidate-evidence-orchestrator.mjs\",",
    "  \"scripts/release-evidence-cleanup.mjs\",",
    "  \"scripts/release-candidate-evidence-issue.mjs\",",
    "  \"scripts/release-readiness.mjs\",",
    "  \"scripts/verify-action-major-tag.mjs\",",
    "];",
    ""
  ].join("\n");
}

function createLintAndFormatDecisionText() {
  return [
    "Use `oxlint` as the first real lint gate.",
    "",
    "The `lint` command must:",
    "",
    "- run `oxlint . --deny-warnings`",
    "- fail on warnings",
    "- run in hosted CI as its own validation step",
    "- be covered by `release-readiness` contract checks so the package script and CI workflow cannot",
    "  silently drift back to placeholders",
    "",
    "Keep `format` intentionally unconfigured for now. The placeholder must continue to fail instead of",
    "pretending formatting is enforced.",
    "",
    "`oxfmt` is not selected as the repository formatter because it is still a 0.x package and is focused",
    "on JavaScript-family formatting rather than the full Markdown, YAML, JSON, and TypeScript surface",
    "owned by this repository.",
    "",
    "A future formatter-baseline change may enable `format`, but it must be isolated from feature work",
    "and should:",
    "",
    "- choose a formatter that covers the repository file types it claims to own",
    "- include the formatter config, ignore rules, and lockfile change in the same commit",
    "- run the formatter across the selected baseline once",
    "- avoid mixing baseline style rewrites with product, schema, provider, or Action behavior changes",
    "",
    "`format` remains a known gap, not a fake success.",
    ""
  ].join("\n");
}

function createLedgerFormatDocumentText() {
  return [
    "Each non-empty line is one approved `clarissimi.assessment/v1` JSON object.",
    "",
    "`source.pullRequestNumber` stores the PR number used for duplicate detection and rebuild ordering.",
    "`evidenceRefs[]` stores the human-clickable PR URL when a `pull_request` evidence reference is",
    "available.",
    "The MVP schema does not store a separate top-level ledger `id` or `source.url`.",
    "",
    "Ledger records must not contain public contributor scores, average scores, ranks, leaderboard",
    "positions, contributor tiers, or points.",
    "",
    "- `confidence`: confidence in this draft assessment, not a contributor score",
    "- `impactLevel`: impact of this contribution event, not a person ranking",
    "",
    "Maintainer-only analytics may calculate recent recognition share from the same ledger, but those",
    "results are stdout-only analysis and are not public derived ledger outputs.",
    "",
    "Public ledger records are assessment-only.",
    "They must not store AI agent, delegated model, prompt,",
    "token, provider, or draft-envelope provenance.",
    "Delegated workflow metadata may exist in local draft envelopes before review, but CLI draft commands sanitize public records so provenance does not",
    "become repository recognition truth.",
    "",
    "The MVP keeps one canonical ledger file.",
    "",
    "If ledger size or merge conflicts become a real operational problem, the accepted migration path is",
    "yearly partitions plus an index, as described in",
    "[`ADR 0022`](../adr/0022-keep-ledger-single-file-with-partition-path.md). Monthly partitions remain",
    "deferred until repository volume justifies the extra lookup and migration complexity.",
    ""
  ].join("\n");
}

function createCliCommandContractText() {
  return [
    "Help output is informational and must not read",
    "configuration files, ledger files, provider credentials, GitHub tokens, or repository evidence.",
    "",
    "If both default config files exist, the command fails closed and requires `--config <path>` to choose one.",
    "It also rejects duplicate public records with the same contributor platform, contributor id,",
    "repository, event, and pull request number.",
    "",
    "- `--provider openai-compatible`: explicit live provider path",
    "`openai-compatible` requires `CLARISSIMI_PROVIDER_TOKEN` in the process environment.",
    "",
    "The fixture-first implementation previews rebuilds by default and writes files only when `--out-dir`",
    "is explicit.",
    "",
    "Calculates maintainer-only recent recognition share from approved ledger records.",
    "The command may report internal recognition weight and recognition share for maintainer review. It",
    "must not write `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, static public JSON, or any public",
    "scoreboard artifact.",
    "",
    "The command validates the contained assessment, accepts only `maintainerApprovalStatus: \"draft\"`, strips",
    "raw evidence excerpts, and writes a deterministic review file based on repository, event, and pull",
    "request number. It refuses to overwrite an existing staged draft by default.",
    "",
    "Approves a staged draft after maintainer review by rewriting the selected file as a sanitized",
    "`clarissimi.assessment/v1` document with `maintainerApprovalStatus: \"approved\"`.",
    "Use `import-draft` after this command to publish the approved",
    "record into the ledger.",
    "",
    "The command validates the draft, rejects non-public approval states, appends the sanitized public",
    "record to the selected ledger, refuses duplicate contributor/source pull request records, and",
    "rebuilds derived outputs. It does not call providers, read provider tokens, fetch GitHub evidence,",
    "decide approval, mutate branches, create pull requests, or store AI/provider provenance in public",
    "recognition records.",
    "By default, `--ledger` is `.clarissimi/contributions.jsonl`. The override is for local validation,",
    "test fixtures, and recovery workflows; it is not an MVP monthly or yearly partition mode.",
    "",
    "Unexpected positional arguments must fail as usage errors before config loading, ledger reads,",
    "provider resolution, draft writes, or rebuild work begins.",
    "",
    "| `7` | write failure |",
    "A command writes public recognition without approval or configured policy.",
    ""
  ].join("\n");
}

function createCliOutputExitCodesDocumentText() {
  return [
    "Clarissimi output must help maintainers review what happened without leaking raw evidence or",
    "provider internals.",
    "",
    "JSON output should be stable enough for CI and must not include:",
    "",
    "- raw provider response",
    "- raw diff",
    "- raw issue or PR body",
    "- raw patch excerpt",
    "- secrets or redacted source text",
    "- private environment values",
    "",
    "- `0`: success",
    "- `1`: usage error",
    "- `2`: invalid configuration",
    "- `3`: invalid ledger",
    "- `4`: provider or fixture recognition failure",
    "- `5`: provider schema validation failure",
    "- `6`: policy rejection",
    "- `7`: write failure",
    "",
    "- Output implies a recognition entry was approved when it is only a draft.",
    "- Output calls a contributor high, medium, or low quality.",
    "- JSON output leaks raw evidence.",
    "- Exit behavior changes without CLI tests.",
    ""
  ].join("\n");
}

function createCliConfigurationDocumentText() {
  return [
    "Default discovery checks",
    "`clarissimi.config.ts` and `.clarissimi/config.json`; if both exist, the CLI fails closed and",
    "requires `--config <path>` so migration between formats is explicit.",
    "",
    "`packages/schemas` validates supported config values. The CLI owns file loading and precedence.",
    "",
    "Current precedence is:",
    "",
    "1. explicit CLI flags",
    "2. explicit `--config <path>` or the single discovered config file",
    "3. package defaults",
    "",
    "- `provider`: `fake` or `openai-compatible`",
    "- `providerModel`: model name for `openai-compatible`",
    "- `providerEndpoint`: optional OpenAI-compatible chat completions endpoint; must be an HTTP(S) URL",
    "- `providerThinking`: optional OpenAI-compatible thinking mode; currently only `disabled`",
    "- `mode`: `dry-run`, `propose`, or `commit` as schema-recognized output mode values",
    "- `markdownSummary`: `none` or `table`",
    "",
    "TypeScript config files must be named `clarissimi.config.ts` and must export a default config",
    "object. They are loaded through the Node.js 24 runtime rather than a third-party loader dependency.",
    "",
    "`recognize` currently supports only `dry-run`.",
    "`recognize`, `import-draft`, and `rebuild` accept `--markdown-summary none|table`.",
    "",
    "Provider API keys and GitHub tokens must not be stored in config files.",
    "The CLI reads `CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.",
    "",
    "- Config examples include fake tokens or real-looking secrets.",
    "- Config bypasses redaction before provider calls.",
    ""
  ].join("\n");
}

function createAgentAssistedDraftsDocumentText() {
  return [
    "Use this guide when a maintainer asks an already-running AI coding agent, such as Codex, Claude",
    "Code, Grok, or OpenCode, to inspect a pull request and produce a Clarissimi draft without giving",
    "Clarissimi a provider API key.",
    "",
    "The agent is responsible for reading the pull request evidence in conversation. Clarissimi is",
    "responsible for validating the resulting JSON, enforcing approval status, and rendering public",
    "recognition files.",
    "",
    "For the current MVP, agent-authored drafts use `clarissimi.assessment/v1` and represent a merged",
    "pull request source.",
    "",
    "- `source.pullRequestNumber` stores the pull request number used for duplicate detection.",
    "- `impactLevel` is an internal recognition weight of `low`, `medium`, or `high`; it is not a public",
    "  contributor score.",
    "- `confidence` is provider or agent confidence from `0` to `1`; it is not averaged into a public",
    "  contributor score.",
    "- Public outputs must not include total score, average score, rank, leaderboard, or contributor tier",
    "  fields.",
    "- Raw evidence excerpts may be useful while drafting, but public ledger rendering strips",
    "  `evidenceRefs[].excerpt`.",
    "",
    "node packages/cli/dist/bin/clarissimi.js stage-draft --draft agent-draft.json --json",
    "node packages/cli/dist/bin/clarissimi.js approve-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --json",
    "node packages/cli/dist/bin/clarissimi.js import-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --out-dir . --json",
    "",
    "`import-draft` appends only approved or auto-approved records to `.clarissimi/contributions.jsonl`.",
    "Derived files such as `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, and static JSON are",
    "rebuilt from the ledger.",
    "",
    "clarissimi.draft-envelope/v1",
    "",
    "The envelope is accepted for interoperability, but Clarissimi records only the validated",
    "`assessment` in public outputs. The public ledger does not store AI agent, model, prompt, token, or",
    "provider provenance.",
    ""
  ].join("\n");
}

function createCiOperationalDocumentText() {
  return [
    "The hosted CI workflow `.github/workflows/ci.yml` runs on `push` to `main`, `pull_request`, and",
    "manual dispatch. It uses read-only repository permissions and runs `docs`, `release-readiness`,",
    "`lint`, `smoke`, `check`, and `contract` with Node.js 24 and the package-manager version declared",
    "by `package.json`.",
    "",
    "`pnpm run hosted-ci-validation` uses `gh run list` to find the `CI` workflow run",
    "for the selected commit and `gh run watch` while it is still running.",
    "",
    "The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`",
    "to pass with strict up-to-date status checks. Administrator enforcement is disabled so repository",
    "owners can recover from CI or protection misconfiguration without changing the branch rule first.",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createOperationalContractDocumentText() {
  return [
    "- Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "  `pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges.",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createObservabilityDocumentText() {
  return [
    "- hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`",
    "- manual dogfood workflow run URLs for propose, stage-draft, and live-provider smoke",
    "",
    "Maintainers should preserve workflow URLs and PR URLs in",
    "release evidence when a manual dogfood run proves a gate.",
    "",
    "Health checks:",
    "",
    "- `pnpm run docs`",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- `pnpm run smoke`",
    "- `pnpm run check`",
    "- `pnpm run contract`",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createServiceLevelsDocumentText() {
  return [
    "| Area | Target |",
    "| --- | --- |",
    "| Source-only merge readiness | Local `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`, and hygiene checks pass before push. |",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createSecretsDocumentText() {
  return [
    "Rerun secret scan, `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract`.",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createBackupRestoreDocumentText() {
  return [
    "Integrity checks after restore:",
    "",
    "- `clarissimi validate-ledger`",
    "- `pnpm run docs`",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- `pnpm run smoke`",
    "- `pnpm run check`",
    "- `pnpm run contract`",
    "- secret scan for committed provider tokens, GitHub tokens, private keys, and environment files",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createIncidentResponseDocumentText() {
  return [
    "Incident response is repository-local for the MVP. Maintainers should treat unsafe recognition",
    "publication, token exposure, branch mutation, and release-gate failures as incidents even when no",
    "hosted service is down.",
    "",
    "| SEV-1 | Token, private key, raw provider output, raw diff, or sensitive evidence is public. |",
    "| SEV-2 | Default branch or canonical ledger is mutated incorrectly. |",
    "| SEV-3 | Proposal pull request, Action output, or docs contain incorrect but non-sensitive recognition text. |",
    "| SEV-4 | Local validation, hosted CI, or dogfood workflow is flaky without unsafe output. |",
    "",
    "1. Capture commit SHA, workflow run URL, PR URL, and local command output.",
    "2. Stop affected release or dogfood activity.",
    "3. Use `docs/ops/secrets.md` for credential exposure.",
    "4. Use `docs/ops/rollback.md` for proposal branch, pull request, or ledger cleanup.",
    "5. Rerun required validation before resuming.",
    "",
    "- Add or update tests when the incident was preventable by validation.",
    "- Do not publish or promote a versioned Action tag while any required release gate is failing.",
    "- Primary owner: Repository maintainers",
    ""
  ].join("\n");
}

function createDisasterRecoveryDocumentText() {
  return [
    "Clarissimi disaster recovery covers repository-state corruption, unsafe recognition publication,",
    "secret leakage, and broken release gates. It does not cover hosted runtime failover because no",
    "hosted service exists in the MVP.",
    "",
    "- public recognition output contains raw evidence, provider raw output, secrets, raw diffs, or",
    "  patch excerpts",
    "- write-mode automation mutates the default branch directly",
    "- branch protection no longer requires the hosted `Validation` check",
    "- provider credentials are committed, logged, or copied into public artifacts",
    "- `.clarissimi/contributions.jsonl` cannot be parsed or rebuilt into derived outputs",
    "",
    "1. Stop release, publication, and dogfood workflow runs.",
    "2. Close or pause unsafe proposal pull requests.",
    "3. Revoke or rotate any exposed credential.",
    "4. Preserve the failing commit SHA, workflow run URL, pull request URL, and changed file list.",
    "5. Choose rollback or forward-fix using `docs/ops/rollback.md`.",
    "",
    "- exact commit SHA and branch",
    "- workflow run URL and job logs",
    "- redacted summary of any exposed secret or sensitive evidence",
    "- Primary owner: Repository maintainers",
    ""
  ].join("\n");
}

function createActionInputsOutputsDocumentText() {
  return [
    "- `mode`: `dry-run`, `propose`, `stage-draft`, or `promote-draft`, default `propose`",
    "- `draft-path`: approved `.clarissimi/drafts/*.json` path required by `promote-draft`",
    "- `summary-path`: optional workspace-relative path for a sanitized JSON summary artifact",
    "- `provider`: `fake` or `openai-compatible`; omitted values fall back to config, then `fake`",
    "- `provider-thinking`: optional OpenAI-compatible thinking mode; currently only `disabled`",
    "- `markdown-summary`: `none` or `table`",
    "",
    "Provider API keys and GitHub tokens are not plain inputs. They must come from secrets or the",
    "workflow environment. The current Action reads `GITHUB_TOKEN` only in `propose`, `stage-draft`, and",
    "`promote-draft` modes for proposal branch and pull request creation or update. It reads",
    "`CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.",
    "",
    "`INPUT_CONFIG_PATH`, `INPUT_DRAFT_PATH`, `INPUT_MODE`, `INPUT_BASE_BRANCH`, `INPUT_REMOTE_NAME`,",
    "`INPUT_SUMMARY_PATH`, `INPUT_PROVIDER`, `INPUT_PROVIDER_MODEL`, `INPUT_PROVIDER_ENDPOINT`, and",
    "`INPUT_PROVIDER_THINKING`.",
    "`INPUT_MARKDOWN_SUMMARY` for derived Markdown layout.",
    "",
    "The root `action.yml` currently exposes `event-path`, `github-fixture`, `draft-path`, `mode`,",
    "`remote-name`, `staging-dir`, `summary-path`, `config-path`, `provider`, `provider-model`,",
    "`provider-endpoint`, and `provider-thinking`.",
    "It also exposes `markdown-summary`.",
    "",
    "`config-path` is explicit-only; the Action does not automatically discover repository config files.",
    "`summary-path` is explicit-only, must be relative, and must stay inside `GITHUB_WORKSPACE`.",
    "An explicit `github-fixture` input takes precedence over the runner-provided `GITHUB_EVENT_PATH`",
    "fallback.",
    "In `propose` and `stage-draft`, event payloads route to the live GitHub collector when no explicit",
    "fixture is provided.",
    "In `promote-draft`, event, fixture, config, and provider inputs are ignored or rejected as",
    "inapplicable; the approved draft file is the only assessment input.",
    "",
    "- `summary-json-path` when `summary-path` is set",
    "",
    "Outputs must not include raw provider output, raw diff text, raw issue text, tokens, private keys,",
    "raw pull request bodies, raw patch excerpts, or sensitive security details.",
    "Step summary content follows the same",
    "raw-evidence exclusion rules as action outputs.",
    ""
  ].join("\n");
}

function createActionContractDocumentText() {
  return [
    "The Action supports dry-run summaries, public recognition proposals, and draft inbox proposals.",
    "",
    "- `INPUT_MODE`: `dry-run`, `propose`, `stage-draft`, or `promote-draft`, default `propose`",
    "- `INPUT_DRAFT_PATH`: approved `.clarissimi/drafts/*.json` path required by `promote-draft`",
    "- `INPUT_SUMMARY_PATH`: optional workspace-relative path for a sanitized JSON summary artifact",
    "- `markdown-summary`: optional `none` or `table` layout for generated `CONTRIBUTORS.md`",
    "- `INPUT_PROVIDER`: `fake` or `openai-compatible`, default `fake`",
    "- `CLARISSIMI_PROVIDER_TOKEN`: provider token required only for `openai-compatible`",
    "- `GITHUB_TOKEN`: token used only by `propose` mode for live GitHub collection and proposal pull",
    "  request creation or update",
    "",
    "Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.",
    "Unsupported `INPUT_MODE` values must fail as usage errors before collection, provider, staging,",
    "branch, or pull request work begins.",
    "",
    "`config-path` is explicit and optional. The Action does not automatically discover repository config",
    "files.",
    "`markdown-summary` controls presentation only.",
    "Invalid summary paths fail before provider calls or write-mode mutation.",
    "",
    "Fixture-first `propose` succeeds only when the fixture explicitly carries an approved or",
    "auto-approved maintainer approval status. Normal provider drafts remain non-public and fail closed",
    "before branch mutation.",
    "",
    "`stage-draft` mode reads `GITHUB_TOKEN` for live GitHub collection and proposal pull request",
    "creation or update. It succeeds only for normal `draft` assessments and stages sanitized",
    "`.clarissimi/drafts/*.json` review files. It must not write `.clarissimi/contributions.jsonl`,",
    "`CONTRIBUTORS.md`, contributor JSON, or static public data.",
    "",
    "`promote-draft` reads `GITHUB_TOKEN` only for proposal branch publication and pull request",
    "creation or update. It accepts one approved JSON file under `.clarissimi/drafts/`, performs no provider or",
    "event collection work, renders public recognition outputs, and uses the normal recognition branch",
    "and pull request boundary. Draft, rejected, or skipped assessments fail before branch mutation.",
    "",
    "Proposal branch commits use a Clarissimi-owned bot author instead of relying on runner-global git",
    "identity.",
    "The source repository in collected evidence remains part of the public recognition context.",
    "",
    "- `summary-json-path` when `summary-path` is set",
    "",
    "The step summary must not include raw pull request bodies, raw patch",
    "excerpts, raw diffs, provider raw output, tokens, or secrets.",
    "Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details.",
    "",
    "- Missing input source: exit `1`, empty stdout, usage message on stderr.",
    "- Unsupported mode: exit `1`, empty stdout, usage message on stderr.",
    "- Explicit `event-path` and `github-fixture` together: exit `1`, empty stdout, usage message on",
    "  stderr.",
    "- Missing `CLARISSIMI_PROVIDER_TOKEN` or `INPUT_PROVIDER_MODEL` for `openai-compatible`: exit `1`,",
    "  empty stdout, usage message on stderr.",
    "- Draft, rejected, or skipped assessment in `propose` mode: exit `4`, empty stdout, diagnostic on",
    "  stderr before branch mutation.",
    "- Approved, auto-approved, rejected, or skipped assessment in `stage-draft` mode: exit `4`, empty",
    "  stdout, diagnostic on stderr before branch mutation.",
    "- Missing or out-of-inbox `draft-path` in `promote-draft`: exit `1`, empty stdout, diagnostic on",
    "  stderr before file reads or branch mutation.",
    "- Invalid, draft, rejected, or skipped assessment in `promote-draft`: exit `4`, empty stdout,",
    "  diagnostic on stderr before branch mutation.",
    "",
    "Dry-run mode should need read permissions only.",
    "Commit mode is not implemented.",
    "",
    "- Default behavior requires broad write permissions.",
    "- Provider secrets are modeled as plain action inputs.",
    "- The Action runs untrusted PR head code.",
    "- `stage-draft` mode writes public recognition outputs or implies maintainer approval.",
    ""
  ].join("\n");
}

function createActionPermissionsDocumentText() {
  return [
    "Clarissimi should request the narrowest permissions required for the selected mode.",
    "Workflow examples must use explicit `permissions`. A workflow must not use `write-all`.",
    "",
    "| Mode | `contents` | `pull-requests` | `issues` | Writes repository files | Opens pull request |",
    "| --- | --- | --- | --- | --- | --- |",
    "| `dry-run` | `read` | `read` | `read` | No | No |",
    "| `propose` | `write` | `write` | `read` | Proposal branch only | Yes |",
    "| `stage-draft` | `write` | `write` | `read` | Draft proposal branch only | Yes |",
    "| `promote-draft` | `write` | `write` | `read` | Recognition proposal branch only | Yes |",
    "",
    "Any permission not listed in a workflow should remain unset, which GitHub treats as `none` when",
    "the workflow uses an explicit `permissions` block.",
    "",
    "- `contents: read`",
    "- `pull-requests: read`",
    "- `issues: read`",
    "",
    "Dry-run mode should not write recognition files, branches, comments, or pull requests.",
    "Do not document `pull_request_target` as the default event.",
    "",
    "- `contents: write`",
    "- `pull-requests: write`",
    "- `issues: read`",
    "",
    "The proposal branch name should be deterministic and scoped under",
    "`clarissimi/recognition/<source-kind>-<source-id>`.",
    "Clarissimi should fail with an actionable diagnostic instead of falling back to direct commits or broader credentials.",
    "",
    "Stage-draft mode writes only a sanitized draft inbox file to a branch and opens a pull request for",
    "maintainer review.",
    "`clarissimi/drafts/<source-kind>-<source-id>`.",
    "Promotion reads one approved draft under `.clarissimi/drafts/`, writes only Clarissimi recognition",
    "",
    "Commit mode requires explicit configuration and should not be the default.",
    "",
    "Avoid default `pull_request_target` examples. Do not checkout or execute untrusted pull request head",
    "code.",
    "",
    "- Secrets are exposed to untrusted fork code.",
    "- Permission changes are not reflected in examples and tests.",
    ""
  ].join("\n");
}

function createOpsValidationFooterTexts() {
  const footer = [
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");

  return {
    "docs/ops/config-and-env.md": footer,
    "docs/ops/disaster-recovery.md": footer,
    "docs/ops/incident-response.md": footer,
    "docs/ops/rollback.md": footer
  };
}

function createEngineeringValidationDocumentTexts() {
  const text = [
    "## Required Evidence",
    "",
    "- Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`",
    ""
  ].join("\n");

  return {
    "docs/engineering/00-project-invariants.md": text,
    "docs/engineering/01-design-review-questions.md": text,
    "docs/engineering/02-code-review-checklist.md": text,
    "docs/engineering/03-performance-budget.md": text,
    "docs/engineering/04-security-baseline.md": text,
    "docs/engineering/05-testing-standard.md": text,
    "docs/engineering/06-dependency-and-change-policy.md": text,
    "docs/engineering/07-operability-and-failure-standard.md": text,
    "docs/engineering/08-threat-model.md": text,
    "docs/engineering/09-data-integrity.md": text
  };
}

function createMonorepoValidationDocumentTexts() {
  const text = [
    "- Monorepo validation evidence: implemented packages are covered by `docs`,",
    "  `release-readiness`, `lint`, `smoke`, `check`, and `contract` before merge.",
    ""
  ].join("\n");

  return {
    "docs/monorepo/README.md": text,
    "docs/monorepo/change-coordination.md": text,
    "docs/monorepo/package-ownership.md": text,
    "docs/monorepo/workspace-boundaries.md": text
  };
}

function createWorkspacePackageManifest(packageDir = "schemas") {
  return {
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        default: "./dist/index.js"
      }
    },
    files: ["dist"],
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/0disoft/clarissimi.git",
      directory: `packages/${packageDir}`
    },
    homepage: "https://github.com/0disoft/clarissimi#readme",
    bugs: {
      url: "https://github.com/0disoft/clarissimi/issues"
    },
    engines: {
      node: ">=24"
    },
    scripts: {
      build: "tsc -b",
      typecheck: "tsc -b --pretty false"
    }
  };
}

function createPackageOwnershipText() {
  return [
    "# Package Ownership",
    "",
    "## Source of Truth",
    "",
    "- Related ADRs: docs/adr/0009-start-schema-package-implementation.md,",
    "  docs/adr/0012-add-fake-provider-package.md,",
    "  docs/adr/0013-add-renderers-package.md,",
    "  docs/adr/0014-add-fixture-first-cli-package.md,",
    "  docs/adr/0015-add-fixture-first-github-collector.md,",
    "  docs/adr/0016-add-dry-run-action-skeleton.md,",
    "  docs/adr/0017-propose-mode-write-boundary.md,",
    "  docs/adr/0018-add-live-github-collector-boundary.md,",
    "  docs/adr/0019-add-openai-compatible-provider-adapter.md,",
    "  docs/adr/0020-add-agent-assisted-draft-import.md,",
    "  docs/adr/0021-add-draft-inbox-staging.md,",
    "  docs/adr/0022-keep-ledger-single-file-with-partition-path.md,",
    "  docs/adr/0023-add-action-draft-inbox-proposal-mode.md,",
    "  docs/adr/0024-add-draft-approval-helper.md,",
    "  docs/adr/0025-centralize-config-schema-validation.md,",
    "  docs/adr/0026-add-maintainer-recent-share-analytics.md,",
    "  docs/adr/0028-add-native-typescript-config-loading.md,",
    "  docs/adr/0029-add-explicit-action-config-path.md,",
    "  docs/adr/0030-add-action-summary-artifact.md",
    "",
    "## Package Table",
    "",
    "| Package | Status | Owns | Must Not Own |",
    "| --- | --- | --- | --- |",
    "| `packages/cli` | Implemented | CLI orchestration | Domain policy |",
    "| `packages/schemas` | Implemented | Shared schema vocabulary | CLI orchestration |",
    "",
    "## Internal Dependency Graph",
    "",
    "| Package | Allowed internal dependencies |",
    "| --- | --- |",
    "| `packages/cli` | `@clarissimi/schemas` |",
    "| `packages/schemas` | none |",
    ""
  ].join("\n");
}

function createReleaseEvidenceText() {
  return [
    "Recent hosted CI validation evidence: `CI` workflow run",
    "`29052254866` passed on `2026-07-09T21:42:23Z` for validated source commit",
    "`eaf22e44f5ef87391a16cf5a6597395826f05b7d` on `main` and validated `docs`,",
    "`release-readiness`, `lint`, `smoke`, `check`, and `contract`.",
    "Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29052254866`.",
    "Refresh this evidence with `pnpm run hosted-ci-validation` for the exact release-candidate commit;",
    "attach the final run URL outside the repository commit if updating this document would change the candidate SHA.",
    "Current dry-run dogfood evidence: `Clarissimi dry run` workflow run",
    "`29031384775` passed on `2026-07-09T15:54:58Z` at",
    "`77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb` and exercised summary artifact validation.",
    "Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29031384775`.",
    "Current dogfood evidence: `Clarissimi propose fixture` workflow run",
    "`29027800039` passed on `2026-07-09T15:02:15Z` and created proposal pull request",
    "https://github.com/0disoft/clarissimi/pull/1.",
    "Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29027800039`.",
    "Fixture-only cleanup: pull request `#1` was closed after evidence capture, and branch",
    "`clarissimi/recognition/merged_pull_request-42` was deleted because sample data is",
    "not intended to merge into the real repository ledger.",
    "Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run",
    "`29027802451` passed on `2026-07-09T15:02:10Z` and created draft review pull request",
    "https://github.com/0disoft/clarissimi/pull/2.",
    "Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29027802451`.",
    "Fixture-only cleanup: pull request `#2` was closed after evidence capture, and branch",
    "`clarissimi/drafts/merged_pull_request-42` was deleted because staged sample data is",
    "not intended to merge into the real repository draft inbox.",
    "Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.",
    "Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`.",
    "Current UMANS evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`.",
    "Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run",
    "`29052452214` passed on `2026-07-09T21:45:58Z` for validated source commit",
    "`eaf22e44f5ef87391a16cf5a6597395826f05b7d` on `main` using repository secret",
    "`CLARISSIMI_PROVIDER_TOKEN` and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.",
    "Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29052452214`.",
    "Refresh this evidence with",
    "`pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact release-candidate commit;",
    "attach the final run URL outside the repository commit if updating this document would change the candidate SHA."
  ].join("\n");
}

function createRollbackProcedureText() {
  return [
    "# Rollback",
    "",
    "`pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`, `pnpm run smoke`,",
    "`pnpm run check`, `pnpm run contract`, `actionlint`, `ssealed doctor . --json`, YAML parsing,",
    "",
    "| State | Rollback action |",
    "| --- | --- |",
    "| Temporary staging output only | Delete the temporary staging directory. |",
    "| Local proposal branch only | Delete the local `clarissimi/recognition/<source-kind>-<source-id>` branch. |",
    "| Published proposal branch without pull request | Delete the remote proposal branch. |",
    "| Open proposal pull request before merge | Close the proposal pull request and delete the proposal branch. |",
    "| Failed integration-lab full-write smoke leaves run-scoped resources | Preview `pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`. |",
    "| Merged recognition pull request | Revert the recognition pull request and run the rebuild path for derived outputs. |",
    "| Published Action tag with a normal defect | Keep the tag immutable and publish a corrective patch tag. |",
    "| Moving `v0` alias fails verification | Restore the recorded previous SHA with a lease. |",
    "",
    "```powershell",
    "git branch --delete clarissimi/recognition/<source-kind>-<source-id>",
    "git push origin --delete clarissimi/recognition/<source-kind>-<source-id>",
    "```",
    "",
    "After the revert lands, regenerate derived outputs with the configured rebuild command.",
    "For smoke cleanup, do not delete broad `clarissimi/*` patterns. Add `--apply` only after reviewing the preview.",
    "The cleanup command fails if any matched pull request or branch remains. Rerun the Clarissimi smoke orphan audit.",
    "For a published Action tag with a normal defect, do not move or overwrite the existing tag.",
    "Restore `v0` to the SHA recorded before promotion.",
    "An urgent security or supply-chain incident records the old SHA, replacement SHA, affected users, and verification evidence.",
    "",
    "No database rollback exists in the MVP.",
    "",
    "- `.clarissimi/contributions.jsonl`",
    "",
    "Derived files should be regenerated from approved contribution records instead of hand-edited during rollback.",
    ""
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
    "  config-path:",
    "    required: false",
    "  markdown-summary:",
    "    required: false",
    "  draft-path:",
    "    required: false",
    "  base-branch:",
    "    required: false",
    "    default: main",
    "  remote-name:",
    "    required: false",
    "    default: origin",
    "  staging-dir:",
    "    required: false",
    "  summary-path:",
    "    required: false",
    "  provider:",
    "    required: false",
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
    "  summary-json-path:",
    "    value: ${{ steps.clarissimi.outputs.summary-json-path }}",
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Run Clarissimi",
    "      env:",
    "        GITHUB_TOKEN: ${{ (inputs.mode == 'propose' || inputs.mode == 'stage-draft' || inputs.mode == 'promote-draft') && github.token || '' }}",
    "        INPUT_MODE: ${{ inputs.mode }}",
    "        INPUT_EVENT_PATH: ${{ inputs.event-path }}",
    "        INPUT_GITHUB_FIXTURE: ${{ inputs.github-fixture }}",
    "        INPUT_CONFIG_PATH: ${{ inputs.config-path }}",
    "        INPUT_MARKDOWN_SUMMARY: ${{ inputs.markdown-summary }}",
    "        INPUT_DRAFT_PATH: ${{ inputs.draft-path }}",
    "        INPUT_BASE_BRANCH: ${{ inputs.base-branch }}",
    "        INPUT_REMOTE_NAME: ${{ inputs.remote-name }}",
    "        INPUT_STAGING_DIR: ${{ inputs.staging-dir }}",
    "        INPUT_SUMMARY_PATH: ${{ inputs.summary-path }}",
    "        INPUT_PROVIDER: ${{ inputs.provider }}",
    "        INPUT_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "        INPUT_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "        INPUT_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}",
    "      run: |",
    "        node \"$GITHUB_ACTION_PATH/action-dist/index.js\""
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
    "      summary-path: .clarissimi/dogfood-fixture-summary.json",
    "  - run: |",
    "      test \"${{ steps.fixture.outputs.mode }}\" = \"dry-run\"",
    "      test \"${{ steps.fixture.outputs.input-source }}\" = \"github_fixture\"",
    "      test -n \"${{ steps.fixture.outputs.summary-json-path }}\"",
    "      test -f \"${{ steps.fixture.outputs.summary-json-path }}\"",
    "      Summary artifact leaked raw fixture evidence.",
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
    "      evidence-id:",
    "        description: Optional release evidence correlation id.",
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
    "      - name: Verify evidence correlation id",
    "        env:",
    "          EVIDENCE_ID: ${{ inputs.evidence-id }}",
    "        run: test -n \"${EVIDENCE_ID}\"",
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
