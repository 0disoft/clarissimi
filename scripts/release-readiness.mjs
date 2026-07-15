import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const requiredPackageScripts = [
  {
    name: "bundle:action",
    includes: ["pnpm run build", "scripts/bundle-action.mjs"],
  },
  {
    name: "bundle:action:check",
    includes: ["pnpm run build", "scripts/bundle-action.mjs --check"],
  },
  {
    name: "docs",
    includes: ["scripts/validate-docs.mjs"],
  },
  {
    name: "smoke",
    includes: ["scripts/smoke.mjs"],
  },
  {
    name: "lint",
    includes: ["oxlint . --deny-warnings"],
  },
  {
    name: "format",
    includes: ["oxfmt --check"],
  },
  {
    name: "migration-check",
    includes: ["pnpm run build", "scripts/migration-check.mjs"],
  },
  {
    name: "check",
    includes: ["pnpm run typecheck", "pnpm run test"],
  },
  {
    name: "contract",
    includes: ["pnpm run typecheck", "pnpm run test"],
  },
  {
    name: "release-readiness",
    includes: ["scripts/release-readiness.mjs"],
  },
  {
    name: "live-provider-smoke",
    includes: ["scripts/live-provider-smoke.mjs"],
  },
  {
    name: "hosted-ci-validation",
    includes: ["scripts/hosted-ci-validation.mjs"],
  },
  {
    name: "hosted-external-consumer-smoke",
    includes: ["scripts/hosted-external-consumer-smoke.mjs"],
  },
  {
    name: "hosted-live-provider-smoke",
    includes: ["scripts/hosted-live-provider-smoke.mjs"],
  },
  {
    name: "verify-action-major-tag",
    includes: ["scripts/verify-action-major-tag.mjs"],
  },
  {
    name: "verify-marketplace-release",
    includes: ["scripts/verify-marketplace-release.mjs"],
  },
  {
    name: "release-candidate-evidence-orchestrator",
    includes: ["scripts/release-candidate-evidence-orchestrator.mjs"],
  },
  {
    name: "publish-action-release",
    includes: ["scripts/publish-action-release.mjs"],
  },
  {
    name: "promote-action-major-alias",
    includes: ["scripts/promote-action-major-alias.mjs"],
  },
  {
    name: "release-evidence-cleanup",
    includes: ["scripts/release-evidence-cleanup.mjs"],
  },
  {
    name: "release-candidate-evidence-issue",
    includes: ["scripts/release-candidate-evidence-issue.mjs"],
  },
];

export const requiredTestGlobs = [
  "packages/schemas/test/*.test.mjs",
  "packages/redaction/test/*.test.mjs",
  "packages/core/test/*.test.mjs",
  "packages/github/test/*.test.mjs",
  "packages/providers/test/*.test.mjs",
  "packages/renderers/test/*.test.mjs",
  "packages/cli/test/*.test.mjs",
  "packages/action/test/*.test.mjs",
  "scripts/test/*.test.mjs",
];

export const packageReleasePolicy = {
  private: true,
  version: "0.0.0",
};

export const rootPackageManagerContract = {
  path: "package.json",
  packageManager: "pnpm@11.7.0",
};

export const formatterContract = {
  dependency: "oxfmt",
  version: "0.58.0",
  configPath: ".oxfmtrc.json",
  config: {
    endOfLine: "lf",
    proseWrap: "preserve",
  },
  requiredIgnorePatterns: [
    "action-dist/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".cache/**",
    ".tmp/**",
    "tmp/**",
  ],
};

export const migrationCompatibilityContract = {
  documents: [
    {
      path: "docs/adr/0037-add-migration-compatibility-gate.md",
      requiredSnippets: [
        "Replace the placeholder with a manifest-backed compatibility gate.",
        "the current assessment schema version",
        "every known persisted assessment version",
        "an explicit migration edge and repository-local migration module between every adjacent version",
        "one rejected fixture carrying an unregistered future version",
        "Adding another known version",
        "without an adjacent migration edge, executable migration module, and compatibility fixture must",
        "execute every historical fixture through",
        "require deterministic results from repeated execution",
        "Invalid or escaping paths fail before module loading.",
        "The gate validates compatibility evidence; it does not rewrite ledgers",
      ],
    },
    {
      path: "scripts/migration-check.mjs",
      requiredSnippets: [
        "ASSESSMENT_SCHEMA_VERSION",
        "validateContributionAssessment",
        "manifest.knownVersions",
        "manifest.migrations",
        "loadMigrationModule",
        "must export a migrate function",
        "deterministically",
        "rejected unknown-version fixture must use an unregistered schemaVersion",
        "unknown-version fixture must fail current validation at $.schemaVersion",
      ],
    },
    {
      path: "scripts/test/migration-check.test.mjs",
      requiredSnippets: [
        "migration check accepts the committed v1 compatibility contract",
        "migration check requires an explicit edge when a later version is registered",
        "migration check executes every registered migration and validates the final shape",
        "migration check rejects migration modules outside the repository",
        "migration check rejects non-deterministic migration results",
        "migration check requires the negative fixture to use an unknown version",
      ],
    },
  ],
  manifestPath: "fixtures/migrations/manifest.json",
  manifestSchemaVersion: "clarissimi.migration-manifest/v1",
  currentSchemaVersion: "clarissimi.assessment/v1",
  acceptedFixturePath: "fixtures/migrations/assessment-v1.json",
  rejectedFixturePath: "fixtures/migrations/assessment-unknown-version.json",
};

export const releasePolicyDocumentContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Clarissimi is not ready for public package publication.",
    "ADR 0031 authorizes immutable root GitHub",
    "ADR 0044 authorizes subsequent immutable `v0.x.y` releases",
    "ADR 0034 authorizes moving major alias `v0`",
    "ADR 0045 authorizes free GitHub Marketplace",
    "The current root and workspace packages stay private at `0.0.0`.",
    "Do not bump package versions,",
    "create another moving major alias",
    "Source-only merge: allowed after `pnpm run docs`, `pnpm run release-readiness`,",
    "`pnpm run lint`, `pnpm run format`, `pnpm run migration-check`, `pnpm run smoke`,",
    "`pnpm run check`, `pnpm run contract`, and repository hygiene checks pass.",
    "- Public package publication: blocked.",
    "- Versioned GitHub Action tag: allowed for immutable `v0.x.y` tags under ADR 0044",
    "- Moving GitHub Action major alias: `v0` is allowed under ADR 0034",
    "- GitHub Marketplace publication: allowed for the validated root Action under ADR 0045",
    "The versioned Action tag requires:",
    "Public package publication remains blocked even when every technical gate above passes.",
    "## Marketplace Release Procedure",
    "release type `marketplace-action-tag`",
    "pnpm run publish-action-release -- --version v0.3.0 --sha <candidate-sha> --release-kind stable",
    "primary category `Code review` and secondary category `Utilities`",
    "pnpm run verify-marketplace-release -- --version <v0.x.y>",
    "Marketplace rollback: clear the Marketplace setting without deleting or moving the immutable tag.",
    "## First Action Release Procedure",
    "release type `versioned-action-tag`",
    "## Major Alias Promotion",
    "`pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`",
    "pnpm run promote-action-major-alias -- --release-version <v0.x.y> --sha <commit-sha>",
    "publish a corrective patch tag such as `v0.1.1`",
    "`pnpm run hosted-ci-validation`",
    "`pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`",
    "`pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`",
    "pnpm run publish-action-release -- --version <v0.x.y> --sha <candidate-sha>",
    "`pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`",
    "release PR, release issue, or GitHub release notes",
    "Do not make an evidence-only commit after final candidate validation",
    "docs/ops/release-candidate-evidence.md",
    "public product-positioning guardrails",
    "repository-wide `format` and migration compatibility gates",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
    "Release status: immutable `v0.x.y` Action tags are allowed by ADR 0044",
    "free root Action Marketplace publication",
    "public package publication remains blocked",
  ],
};

export const productPositioningContract = {
  documents: [
    {
      path: "README.md",
      requiredSnippets: [
        "Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories.",
        "Clarissimi is not a contributor scoring leaderboard, an HR scorecard, or an AI code review tool.",
        "AI is used as a drafter that reads repository evidence and prepares a structured recognition draft.",
        "Maintainers remain the approval authority.",
        "Public output should read like contribution history, not a scoreboard.",
      ],
      forbiddenSnippets: [
        "Clarissimi is a contributor scoring tool",
        "Clarissimi is a public leaderboard",
        "Clarissimi ranks contributors",
        "Clarissimi scores contributors",
      ],
    },
    {
      path: "docs/product/02-spec.md",
      requiredSnippets: [
        "Clarissimi must be described as a contribution recognition engine.",
        "Do not describe it as:",
        "- contributor scoring",
        "- contributor ranking",
        "- a public leaderboard",
        "Public output must not show a contributor's percentage share of recent total impact weight, score,",
        "Clarissimi may expose this kind of metric only through a",
        "maintainer-only analytics view unless a future ADR accepts a safer public framing.",
        "An opt-in contributor gallery may instead display one stable-id GitHub avatar",
        "Clarissimi does not generate or rewrite the repository README",
        "Approved contributors may be human, bot, or AI-agent identities.",
        "`includeAutomationContributors: false`; the canonical ledger remains unchanged.",
      ],
      forbiddenSnippets: [
        "Clarissimi must be described as a contributor scoring tool.",
        "Clarissimi must be described as a public leaderboard.",
        "Public output should show contributor scores.",
        "Public output should show contributor ranks.",
      ],
    },
  ],
};

export const readmeValidationContract = {
  path: "README.md",
  requiredSnippets: [
    "## Start in 30 Seconds",
    "- uses: 0disoft/clarissimi@v0.3.4",
    "mode: dry-run",
    "## Choose How Results Are Written",
    "`propose` is the recommended default for shared repositories.",
    "include-automation-contributors: false",
    "## What Clarissimi Creates",
    "Not implemented yet:",
    "- comment updates",
    "Commit mode is an explicit automation-first path",
    "Source-only merges require `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "`pnpm run format`, `pnpm run migration-check`, `pnpm run smoke`, `pnpm run check`, and",
    "`pnpm run contract`, plus repository hygiene checks.",
    "- `pnpm run docs`",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- `pnpm run format`",
    "- `pnpm run migration-check`",
    "- `pnpm run smoke`",
    "- `pnpm run check`",
    "- `pnpm run contract`",
    "Release-only hosted checks are:",
    "- `pnpm run live-provider-smoke`",
    "- `pnpm run hosted-ci-validation`",
    "- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>`",
    "- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0 --expected-sha <commit-sha>`",
    "- `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`",
    "- `pnpm run verify-marketplace-release -- --version <v0.x.y>`",
    "- `pnpm run promote-action-major-alias -- --release-version <v0.x.y> --sha <commit-sha>`",
    "- `pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`",
    "Release-only credentialed checks are:",
    "- `pnpm run hosted-live-provider-smoke -- --model <provider-model>`",
    "`format` runs the repository-wide Oxfmt baseline accepted by ADR 0036",
    "`oxlint` remains the JavaScript and TypeScript lint gate",
    "`migration-check` builds the schema package and validates the committed persisted-schema",
    "compatibility manifest, accepted historical fixtures, executable deterministic migration chains,",
    "current-schema validation, and the unknown-version fail-closed fixture accepted by ADR 0037.",
    'Use `markdownSummary: "gallery"` or `--markdown-summary gallery`',
    "Approved bot and AI-agent contribution records are included by default",
    "`--exclude-automation-contributors`",
  ],
  orderedSnippets: [
    "# Clarissimi",
    "## Start in 30 Seconds",
    "## Choose How Results Are Written",
    "## What Clarissimi Creates",
    "## Product Promise",
  ],
};

export const docsValidationScriptContract = {
  path: "scripts/validate-docs.mjs",
  requiredSnippets: [
    '"README.md"',
    '"action.yml"',
    '"VALIDATION.md"',
    '"docs/product/00-product-brief.md"',
    '"docs/product/01-roadmap.md"',
    '"docs/product/02-spec.md"',
    '"docs/product/03-risk-register.md"',
    '"docs/cli/README.md"',
    '"docs/cli/agent-assisted-drafts.md"',
    '"docs/cli/configuration.md"',
    '"docs/cli/ledger-format.md"',
    '"docs/cli/output-and-exit-codes.md"',
    '"docs/product/04-implementation-tracker.md"',
    '"docs/github-action/README.md"',
    '"docs/github-action/action-contract.md"',
    '"docs/github-action/permissions.md"',
    '"docs/ops/ci.md"',
    '"docs/ops/disaster-recovery.md"',
    '"docs/ops/incident-response.md"',
    '"docs/ops/release-candidate-evidence.md"',
    '"docs/ops/release.md"',
    '"docs/ops/rollback.md"',
    '"packages/action/README.md"',
    '"packages/cli/README.md"',
    '"packages/core/README.md"',
    '"packages/github/README.md"',
    '"packages/providers/README.md"',
    '"packages/redaction/README.md"',
    '"packages/renderers/README.md"',
    '"packages/schemas/README.md"',
    '".github/workflows/ci.yml"',
    '".github/workflows/clarissimi-dry-run.yml"',
    '".github/workflows/clarissimi-live-provider-smoke.yml"',
    '".github/workflows/clarissimi-propose-fixture.yml"',
    '".github/workflows/clarissimi-stage-draft-fixture.yml"',
    '"scripts/hosted-external-consumer-smoke.mjs"',
    '"scripts/hosted-live-provider-smoke.mjs"',
    '"scripts/release-candidate-evidence-orchestrator.mjs"',
    '"scripts/release-evidence-cleanup.mjs"',
    '"scripts/release-candidate-evidence-issue.mjs"',
    '"scripts/release-readiness.mjs"',
    '"scripts/verify-action-major-tag.mjs"',
    '"scripts/verify-marketplace-release.mjs"',
    '"scripts/promote-action-major-alias.mjs"',
  ],
};

export const lintAndFormatDecisionDocumentContract = {
  path: "docs/adr/0036-replace-prettier-with-oxfmt.md",
  requiredSnippets: [
    "Replace Prettier with exactly pinned `oxfmt@0.58.0`.",
    "run `oxfmt --check`",
    "cover maintained TypeScript, JavaScript, JSON, Markdown, and YAML files",
    "use `.oxfmtrc.json`",
    "use `ignorePatterns`",
    "exclude `action-dist/**`",
    "run in hosted CI as its own non-writing validation step",
    "be protected by `release-readiness` checks",
    "Future changes must pass",
    "CI must never rewrite source files.",
    "tracked `action-dist/index.js` remains outside the formatter surface",
  ],
};

export const ledgerFormatDocumentContract = {
  path: "docs/cli/ledger-format.md",
  requiredSnippets: [
    "Each non-empty line is one approved `clarissimi.assessment/v1` JSON object.",
    "`source.pullRequestNumber` stores the PR number",
    "`evidenceRefs[]` stores the human-clickable PR URL",
    "does not store a separate top-level ledger `id` or `source.url`",
    "Ledger records must not contain public contributor scores, average scores, ranks, leaderboard",
    "- `confidence`: confidence in this draft assessment, not a contributor score",
    "- `impactLevel`: impact of this contribution event, not a person ranking",
    "Maintainer-only analytics may calculate recent recognition share from the same ledger",
    "When `markdownSummary` is `gallery`",
    "deterministic non-ranking order",
    "Public ledger records are assessment-only.",
    "`contributor.kind` may be `human`, `bot`, or `ai_agent`",
    "Display opt-out",
    "They must not store AI agent, delegated model, prompt,",
    "CLI draft commands sanitize public records so provenance does not",
    "The MVP keeps one canonical ledger file",
    "yearly partitions plus an index",
    "Monthly partitions remain",
  ],
};

export const cliCommandContract = {
  path: "docs/cli/command-contract.md",
  requiredSnippets: [
    "Help output is informational and must not read",
    "If both",
    "default config files exist, the command fails closed",
    "It also rejects duplicate public records with the same contributor platform, contributor id,",
    "`--provider openai-compatible`: explicit live provider path",
    "`openai-compatible` requires `CLARISSIMI_PROVIDER_TOKEN` in the process environment.",
    "writes files only when `--out-dir`",
    "Calculates maintainer-only recent recognition share from approved ledger records.",
    "must not write `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, static public JSON",
    'accepts only `maintainerApprovalStatus: "draft"`',
    "refuses to overwrite an existing staged draft by default",
    'with `maintainerApprovalStatus: "approved"`',
    "Use `import-draft` after this command to publish the approved",
    "rejects non-public approval states, appends the sanitized public",
    "does not call providers, read provider tokens, fetch GitHub evidence",
    "it is not an MVP monthly or yearly partition mode",
    "Unexpected positional arguments must fail as usage errors before config loading",
    "Unknown flags,",
    "Repeating the same flag is",
    "| `7`  | write failure",
    "A command writes public recognition without approval or configured policy.",
  ],
};

export const cliOutputExitCodesDocumentContract = {
  path: "docs/cli/output-and-exit-codes.md",
  requiredSnippets: [
    "Clarissimi output must help maintainers review what happened without leaking raw evidence or",
    "provider internals.",
    "raw provider response",
    "raw diff",
    "raw issue or PR body",
    "raw patch excerpt",
    "secrets or redacted source text",
    "private environment values",
    "both success and failure write one JSON document to",
    "This also",
    "applies to argument parsing and usage errors.",
    "- `0`: success",
    "- `1`: usage error",
    "- `2`: invalid configuration",
    "- `3`: invalid ledger",
    "- `4`: provider or fixture recognition failure",
    "- `5`: provider schema validation failure",
    "- `6`: policy rejection",
    "- `7`: write failure",
    "Output implies a recognition entry was approved when it is only a draft.",
    "Output calls a contributor high, medium, or low quality.",
    "JSON output leaks raw evidence.",
    "Exit behavior changes without CLI tests.",
  ],
};

export const cliConfigurationDocumentContract = {
  path: "docs/cli/configuration.md",
  requiredSnippets: [
    "Default discovery checks",
    "`clarissimi.config.ts` and `.clarissimi/config.json`; if both exist, the CLI fails closed",
    "requires `--config <path>` so migration between formats is explicit",
    "`packages/schemas` validates supported config values.",
    "The CLI owns file loading and precedence.",
    "explicit CLI flags",
    "explicit `--config <path>` or the single discovered config file",
    "package defaults",
    "`provider`: `fake` or `openai-compatible`",
    "`providerModel`: model name for `openai-compatible`",
    "`providerEndpoint`: optional OpenAI-compatible chat completions endpoint",
    "`providerEndpointTrust`: `public` or `private-network`, default `public`",
    "`providerThinking`: optional OpenAI-compatible thinking mode; currently only `disabled`",
    "`mode`: `dry-run`, `propose`, or `commit` as schema-recognized output mode values",
    "`markdownSummary`: `none`, `table`, or `gallery`",
    "`includeAutomationContributors`: optional boolean; defaults to `true`",
    "`recognize`, `import-draft`, and `rebuild` accept `--markdown-summary none|table|gallery`",
    "`--exclude-automation-contributors`",
    "TypeScript config files must be named `clarissimi.config.ts` and must export a default config",
    "loaded through the Node.js 24 runtime rather than a third-party loader dependency",
    "`recognize` currently supports only `dry-run`",
    "Provider API keys and GitHub tokens must not be stored in config files.",
    "The CLI reads `CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.",
    "Config examples include fake tokens or real-looking secrets.",
    "Config bypasses redaction before provider calls.",
  ],
};

export const agentAssistedDraftsDocumentContract = {
  path: "docs/cli/agent-assisted-drafts.md",
  requiredSnippets: [
    "already-running AI coding agent",
    "Clarissimi a provider API key.",
    "The agent is responsible for reading the pull request evidence in conversation.",
    "responsible for validating the resulting JSON",
    "enforcing approval status, and rendering public",
    "agent-authored drafts use `clarissimi.assessment/v1` and represent a merged",
    "`source.pullRequestNumber` stores the pull request number",
    "`impactLevel` is an internal recognition weight",
    "`confidence` is provider or agent confidence",
    "Public outputs must not include total score, average score, rank, leaderboard",
    "Raw evidence excerpts may be useful while drafting, but public ledger rendering strips",
    "stage-draft --draft agent-draft.json --json",
    "approve-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --json",
    "import-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --out-dir . --json",
    "`import-draft` appends only approved or auto-approved records to `.clarissimi/contributions.jsonl`.",
    "Derived files such as `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, and static JSON are",
    "clarissimi.draft-envelope/v1",
    "records only the validated",
    "The public ledger does not store AI agent, model, prompt, token, or",
    "provider provenance.",
  ],
};

export const ciOperationalDocumentContract = {
  path: "docs/ops/ci.md",
  requiredSnippets: [
    "The hosted CI workflow `.github/workflows/ci.yml` runs on `push` to `main`, `pull_request`, and",
    "manual dispatch. It uses read-only repository permissions and runs `docs`, `release-readiness`,",
    "`lint`, `format`, `migration-check`, `smoke`, `check`, and `contract` with Node.js 24",
    "`pnpm run hosted-ci-validation`",
    "uses `gh run list` to find the `CI` workflow run",
    "The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`",
    "to pass with strict up-to-date status checks. Administrator enforcement is disabled",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const operationalContractDocumentContract = {
  path: "docs/ops/00-operational-contract.md",
  requiredSnippets: [
    "Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges.",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const observabilityDocumentContract = {
  path: "docs/ops/observability.md",
  requiredSnippets: [
    "hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`",
    "manual dogfood workflow run URLs for propose, stage-draft, and live-provider smoke",
    "Maintainers should preserve workflow URLs and PR URLs in",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const serviceLevelsDocumentContract = {
  path: "docs/ops/service-levels.md",
  requiredSnippets: [
    "Source-only merge readiness | Local `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`, and hygiene checks pass before push.",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const secretsDocumentContract = {
  path: "docs/ops/secrets.md",
  requiredSnippets: [
    "Rerun secret scan, `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract`.",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const backupRestoreDocumentContract = {
  path: "docs/ops/backup-and-restore.md",
  requiredSnippets: [
    "- `clarissimi validate-ledger`",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- `pnpm run smoke`",
    "- `pnpm run check`",
    "- `pnpm run contract`",
    "secret scan for committed provider tokens, GitHub tokens, private keys, and environment files",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const incidentResponseDocumentContract = {
  path: "docs/ops/incident-response.md",
  requiredSnippets: [
    "Incident response is repository-local for the MVP.",
    "unsafe recognition",
    "publication, token exposure, branch mutation, and release-gate failures",
    "Token, private key, raw provider output, raw diff, or sensitive evidence is public.",
    "Default branch or canonical ledger is mutated incorrectly.",
    "Proposal pull request, Action output, or docs contain incorrect but non-sensitive recognition text.",
    "Local validation, hosted CI, or dogfood workflow is flaky without unsafe output.",
    "Capture commit SHA, workflow run URL, PR URL, and local command output.",
    "Stop affected release or dogfood activity.",
    "Use `docs/ops/secrets.md` for credential exposure.",
    "Use `docs/ops/rollback.md` for proposal branch, pull request, or ledger cleanup.",
    "Rerun required validation before resuming.",
    "Add or update tests when the incident was preventable by validation.",
    "Do not publish or promote a versioned Action tag while any required release gate is failing.",
    "Primary owner: Repository maintainers",
  ],
};

export const disasterRecoveryDocumentContract = {
  path: "docs/ops/disaster-recovery.md",
  requiredSnippets: [
    "Clarissimi disaster recovery covers repository-state corruption, unsafe recognition publication,",
    "secret leakage, and broken release gates.",
    "hosted service exists in the MVP.",
    "public recognition output contains raw evidence, provider raw output, secrets, raw diffs, or",
    "write-mode automation mutates the default branch without explicit `commit` mode",
    "branch protection no longer requires the hosted `Validation` check",
    "provider credentials are committed, logged, or copied into public artifacts",
    "`.clarissimi/contributions.jsonl` cannot be parsed or rebuilt into derived outputs",
    "Stop release, publication, and dogfood workflow runs.",
    "Close or pause unsafe proposal pull requests.",
    "Revoke or rotate any exposed credential.",
    "Preserve the failing commit SHA, workflow run URL, pull request URL, and changed file list.",
    "Choose rollback or forward-fix using `docs/ops/rollback.md`.",
    "exact commit SHA and branch",
    "workflow run URL and job logs",
    "redacted summary of any exposed secret or sensitive evidence",
    "Primary owner: Repository maintainers",
  ],
};

export const actionInputsOutputsDocumentContract = {
  path: "docs/github-action/inputs-and-outputs.md",
  requiredSnippets: [
    "- `mode`: `dry-run`, `propose`, `commit`, `stage-draft`, or `promote-draft`, default `propose`",
    "- `draft-path`: approved `.clarissimi/drafts/*.json` path required by `promote-draft`",
    "- `summary-path`: optional workspace-relative path for a sanitized JSON summary artifact",
    "- `provider`: `fake` or `openai-compatible`; omitted values fall back to config, then `fake`",
    "- `provider-endpoint-trust`: `public` or `private-network`, default `public`; use private-network",
    "- `provider-thinking`: optional OpenAI-compatible thinking mode; currently only `disabled`",
    "- `markdown-summary`: `none`, `table`, or `gallery`",
    "- `include-automation-contributors`: optional `true` or `false`",
    "Provider API keys and GitHub tokens are not plain inputs.",
    "reads `GITHUB_TOKEN` in `propose`, `commit`, `stage-draft`,",
    "`CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`",
    "`INPUT_CONFIG_PATH`, `INPUT_DRAFT_PATH`, `INPUT_MODE`",
    "`INPUT_PROVIDER_ENDPOINT_TRUST`, `INPUT_PROVIDER_THINKING`.",
    "`INPUT_MARKDOWN_SUMMARY` for derived Markdown layout.",
    "`include-automation-contributors` falls back to config `includeAutomationContributors`, then `true`.",
    "The root `action.yml` currently exposes `event-path`, `github-fixture`, `draft-path`, `mode`,",
    "`remote-name`, `staging-dir`, `summary-path`, `config-path`, `provider`, `provider-model`,",
    "`provider-endpoint`, `provider-endpoint-trust`, and `provider-thinking`.",
    "`markdown-summary` is also exposed.",
    "`config-path` is explicit-only; the Action does not automatically discover repository config files.",
    "`summary-path` is explicit-only, must be relative, and must stay inside `GITHUB_WORKSPACE`.",
    "An explicit `github-fixture` input takes precedence over the runner-provided `GITHUB_EVENT_PATH`",
    "In `propose`, `commit`, and `stage-draft`, event payloads route to the live GitHub collector",
    "In `promote-draft`, event, fixture, config, and provider inputs are ignored or rejected",
    "- `summary-json-path` when `summary-path` is set",
    "- `direct-commit-base-sha`",
    "- `direct-commit-sha`",
    "Outputs must not include raw provider output, raw diff text, raw issue text, tokens, private keys",
    "Step summary content follows the same",
    "raw-evidence exclusion rules as action outputs.",
  ],
};

export const actionContractDocumentContract = {
  path: "docs/github-action/action-contract.md",
  requiredSnippets: [
    "The Action supports dry-run summaries, public recognition proposals, direct commits",
    "- `INPUT_MODE`: `dry-run`, `propose`, `commit`, `stage-draft`, or `promote-draft`, default `propose`",
    "- `INPUT_DRAFT_PATH`: approved `.clarissimi/drafts/*.json` path required by `promote-draft`",
    "- `INPUT_SUMMARY_PATH`: optional workspace-relative path for a sanitized JSON summary artifact",
    "- `markdown-summary`: optional `none`, `table`, or `gallery` layout for generated",
    "- `include-automation-contributors`: optional `true` or `false`",
    "- `INPUT_PROVIDER`: `fake` or `openai-compatible`, default `fake`",
    "- `INPUT_PROVIDER_ENDPOINT_TRUST`: `public` or `private-network`, default `public`",
    "- `CLARISSIMI_PROVIDER_TOKEN`: provider token required only for `openai-compatible`",
    "- `GITHUB_TOKEN`: token used by write modes for live GitHub collection and repository publication",
    "Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.",
    "Unsupported `INPUT_MODE` values must fail",
    "`config-path` is explicit and optional. The Action does not automatically discover repository config",
    "`markdown-summary` controls presentation only.",
    "`include-automation-contributors` overrides config `includeAutomationContributors`",
    "Invalid summary paths fail before provider",
    "Fixture-first `propose` succeeds only when the fixture explicitly carries an approved or",
    "Normal provider drafts remain non-public and fail closed",
    "`stage-draft` mode reads `GITHUB_TOKEN`",
    "It succeeds only for normal `draft` assessments and stages sanitized",
    "It must not write `.clarissimi/contributions.jsonl`,",
    "`promote-draft` reads `GITHUB_TOKEN` only for proposal branch publication",
    "performs no provider or",
    "Draft, rejected, or skipped assessments fail before branch mutation.",
    "Proposal branch commits use a Clarissimi-owned bot author",
    "The source repository in collected evidence remains part of the public recognition context.",
    "- `summary-json-path` when `summary-path` is set",
    "The step summary must not include raw pull request bodies, raw patch",
    "Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details.",
    "- Missing input source: exit `1`, empty stdout, usage message on stderr.",
    "- Unsupported mode: exit `1`, empty stdout, usage message on stderr.",
    "- Explicit `event-path` and `github-fixture` together: exit `1`, empty stdout, usage message on",
    "- Missing `CLARISSIMI_PROVIDER_TOKEN` or `INPUT_PROVIDER_MODEL` for `openai-compatible`: exit `1`,",
    "- Draft, rejected, or skipped assessment in `propose` mode: exit `4`, empty stdout, diagnostic on",
    "- Approved, auto-approved, rejected, or skipped assessment in `stage-draft` mode: exit `4`, empty",
    "- Missing or out-of-inbox `draft-path` in `promote-draft`: exit `1`, empty stdout, diagnostic on",
    "- Invalid, draft, rejected, or skipped assessment in `promote-draft`: exit `4`, empty stdout,",
    "Dry-run mode should need read permissions only.",
    "needs `contents: write` and no pull-request write permission.",
    "- Default behavior requires broad write permissions.",
    "- Provider secrets are modeled as plain action inputs.",
    "- The Action runs untrusted PR head code.",
    "- `stage-draft` mode writes public recognition outputs or implies maintainer approval.",
  ],
};

export const actionPermissionsDocumentContract = {
  path: "docs/github-action/permissions.md",
  requiredSnippets: [
    "Clarissimi should request the narrowest permissions required for the selected mode.",
    "Workflow examples must use explicit `permissions`.",
    "A workflow must not use `write-all`.",
    "| `dry-run` | `read` | `read` | `read` | No | No |",
    "| `propose` | `write` | `write` | `read` | Proposal branch only | Yes |",
    "| `stage-draft` | `write` | `write` | `read` | Draft proposal branch only | Yes |",
    "| `promote-draft` | `write` | `write` | `read` | Recognition proposal branch only | Yes |",
    "| `commit` | `write` | `read` | `read` | Current branch | No |",
    "Any permission not listed in a workflow should remain unset",
    "- `contents: read`",
    "Dry-run mode should not write recognition files, branches, comments, or pull requests.",
    "Do not document `pull_request_target`",
    "- `contents: write`",
    "- `pull-requests: write`",
    "- `issues: read`",
    "The proposal branch name should be deterministic and scoped under",
    "`clarissimi/recognition/<source-kind>-<source-id>`",
    "Clarissimi should fail with an actionable diagnostic",
    "instead of falling back to direct commits or broader credentials.",
    "Stage-draft mode writes only a sanitized draft inbox file",
    "`clarissimi/drafts/<source-kind>-<source-id>`",
    "Promotion reads one approved draft under `.clarissimi/drafts/`",
    "Commit mode requires explicit configuration and should not be the default.",
    "pushes without force to the configured target branch",
    "Avoid default `pull_request_target` examples.",
    "Do not checkout or execute untrusted pull request head",
    "Secrets are exposed to untrusted fork code.",
    "Permission changes are not reflected in examples and tests.",
  ],
};

export const opsValidationFooterContract = {
  documents: [
    "docs/ops/config-and-env.md",
    "docs/ops/disaster-recovery.md",
    "docs/ops/incident-response.md",
    "docs/ops/rollback.md",
  ],
  requiredSnippets: [
    "- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`",
  ],
};

export const engineeringValidationDocumentContract = {
  documents: [
    "docs/engineering/00-project-invariants.md",
    "docs/engineering/01-design-review-questions.md",
    "docs/engineering/02-code-review-checklist.md",
    "docs/engineering/03-performance-budget.md",
    "docs/engineering/04-security-baseline.md",
    "docs/engineering/05-testing-standard.md",
    "docs/engineering/06-dependency-and-change-policy.md",
    "docs/engineering/07-operability-and-failure-standard.md",
    "docs/engineering/08-threat-model.md",
    "docs/engineering/09-data-integrity.md",
  ],
  requiredSnippets: [
    "Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "`pnpm run smoke`, `pnpm run check`, `pnpm run contract`",
  ],
};

export const monorepoValidationDocumentContract = {
  documents: [
    "docs/monorepo/README.md",
    "docs/monorepo/change-coordination.md",
    "docs/monorepo/package-ownership.md",
    "docs/monorepo/workspace-boundaries.md",
  ],
  requiredSnippets: [
    "Monorepo validation evidence:",
    "release-readiness",
    "lint",
    "smoke",
    "check",
    "contract",
  ],
};

export const packageOwnershipContract = {
  path: "docs/monorepo/package-ownership.md",
  requiredAdrReferences: [
    "docs/adr/0009-start-schema-package-implementation.md",
    "docs/adr/0012-add-fake-provider-package.md",
    "docs/adr/0013-add-renderers-package.md",
    "docs/adr/0014-add-fixture-first-cli-package.md",
    "docs/adr/0015-add-fixture-first-github-collector.md",
    "docs/adr/0016-add-dry-run-action-skeleton.md",
    "docs/adr/0017-propose-mode-write-boundary.md",
    "docs/adr/0018-add-live-github-collector-boundary.md",
    "docs/adr/0019-add-openai-compatible-provider-adapter.md",
    "docs/adr/0020-add-agent-assisted-draft-import.md",
    "docs/adr/0021-add-draft-inbox-staging.md",
    "docs/adr/0022-keep-ledger-single-file-with-partition-path.md",
    "docs/adr/0023-add-action-draft-inbox-proposal-mode.md",
    "docs/adr/0024-add-draft-approval-helper.md",
    "docs/adr/0025-centralize-config-schema-validation.md",
    "docs/adr/0026-add-maintainer-recent-share-analytics.md",
    "docs/adr/0028-add-native-typescript-config-loading.md",
    "docs/adr/0029-add-explicit-action-config-path.md",
    "docs/adr/0030-add-action-summary-artifact.md",
  ],
};

export const workspaceContract = {
  path: "pnpm-workspace.yaml",
  requiredPackageGlob: '"packages/*"',
  requiredBuildAllow: "  esbuild: true",
  packageNameScope: "@clarissimi",
};

export const workspacePackageManifestSurfaceContract = {
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  files: ["dist"],
  license: "Apache-2.0",
  repository: {
    type: "git",
    url: "git+https://github.com/0disoft/clarissimi.git",
  },
  homepage: "https://github.com/0disoft/clarissimi#readme",
  bugs: {
    url: "https://github.com/0disoft/clarissimi/issues",
  },
  engines: {
    node: ">=24",
  },
  scripts: {
    build: "tsc -b",
    typecheck: "tsc -b --pretty false",
  },
  binsByPackageDir: {
    action: {
      "clarissimi-action": "./dist/bin/clarissimi-action.js",
    },
    cli: {
      clarissimi: "./dist/bin/clarissimi.js",
    },
  },
};

export const smokePackCandidateContract = {
  path: "scripts/smoke.mjs",
  requiredSnippets: [
    "assertWorkspacePackagePackDryRuns",
    "validatePackagePackDryRun",
    "pnpm",
    "pack",
    "--dry-run",
    "--json",
    '{ dir: "schemas" }',
    '{ dir: "redaction" }',
    '{ dir: "core" }',
    '{ dir: "github" }',
    '{ dir: "providers" }',
    '{ dir: "renderers" }',
    '{ dir: "cli", requiredFiles: ["dist/bin/clarissimi.js"] }',
    '{ dir: "action", requiredFiles: ["dist/bin/clarissimi-action.js"] }',
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.d.ts",
    "src/",
    "test/",
    "tsconfig.json",
    "node_modules/",
    ".tsbuildinfo",
  ],
};

export const workspaceInternalDependencyContract = {
  internalScope: "@clarissimi/",
  workspaceRange: "workspace:*",
  dependenciesByPackageDir: {
    action: ["core", "github", "providers", "renderers", "schemas"],
    cli: ["core", "github", "providers", "renderers", "schemas"],
    core: ["redaction", "schemas"],
    github: ["core", "schemas"],
    providers: ["core", "schemas"],
    redaction: [],
    renderers: ["core", "schemas"],
    schemas: [],
  },
};

export const tsconfigBuildGraphContract = {
  path: "tsconfig.json",
  packageReferencePrefix: "./packages/",
};

export const trackedGeneratedOutputContract = {
  forbiddenPathFragments: [
    "/dist/",
    "/build/",
    "/coverage/",
    "/.cache/",
    "/.tmp/",
    "/tmp/",
    "/node_modules/",
  ],
  forbiddenPathSuffixes: [".tsbuildinfo"],
};

export const credentialedReleaseEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Current live-provider evidence: local `pnpm run live-provider-smoke` passed",
    "CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini",
    "Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed",
    "CLARISSIMI_PROVIDER_MODEL=minimax-m3",
    "Current UMANS evidence: local `pnpm run live-provider-smoke` passed",
    "CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2",
    "Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run",
    "CLARISSIMI_PROVIDER_TOKEN",
    "CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini",
    "`pnpm run hosted-live-provider-smoke -- --model <provider-model>`",
    "attach the final run URL outside the repository commit",
  ],
  requiredPatterns: [
    {
      description: "a numeric hosted live-provider workflow run id",
      pattern: /Recent hosted live-provider evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a hosted live-provider workflow timestamp",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
    {
      description: "a hosted live-provider validated source commit SHA",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*validated source commit[\s\S]*`[0-9a-f]{40}`/,
    },
    {
      description: "a hosted live-provider workflow run URL",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*Run URL:\s*`https:\/\/github\.com\/0disoft\/clarissimi\/actions\/runs\/[0-9]{8,}`\.[\s\S]*Refresh this evidence/,
    },
    {
      description: "a hosted live-provider release-candidate refresh command",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*Refresh this evidence[\s\S]*`pnpm run hosted-live-provider-smoke -- --model <provider-model>`[\s\S]*for the exact[\s\S]*release-candidate commit[\s\S]*attach[\s\S]*outside the repository commit/,
    },
  ],
};

export const writeModeDogfoodEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Current dogfood evidence: `Clarissimi propose fixture` workflow run",
    "Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run",
    "https://github.com/0disoft/clarissimi/actions/runs/29027800039",
    "https://github.com/0disoft/clarissimi/actions/runs/29027802451",
    "https://github.com/0disoft/clarissimi/pull/1",
    "https://github.com/0disoft/clarissimi/pull/2",
    "Fixture-only cleanup:",
    "pull request `#1` was closed after evidence capture",
    "pull request `#2` was closed after evidence capture",
    "clarissimi/recognition/merged_pull_request-42",
    "clarissimi/drafts/merged_pull_request-42",
    "not intended to merge into the real repository ledger",
    "not intended to merge into the real repository draft inbox",
  ],
  requiredPatterns: [
    {
      description: "a numeric propose fixture workflow run id",
      pattern: /Current dogfood evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a propose fixture workflow timestamp",
      pattern: /Current dogfood evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
    {
      description: "a numeric stage-draft fixture workflow run id",
      pattern: /Current draft dogfood evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a stage-draft fixture workflow timestamp",
      pattern:
        /Current draft dogfood evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
  ],
};

export const dryRunDogfoodEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Current dry-run dogfood evidence: `Clarissimi dry run` workflow run",
    "summary artifact validation",
    "77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb",
    "https://github.com/0disoft/clarissimi/actions/runs/29031384775",
  ],
  requiredPatterns: [
    {
      description: "a numeric dry-run dogfood workflow run id",
      pattern: /Current dry-run dogfood evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a dry-run dogfood workflow timestamp",
      pattern:
        /Current dry-run dogfood evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
  ],
};

export const hostedCiEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Recent hosted CI validation evidence: `CI` workflow run",
    "`release-readiness`, `lint`, `smoke`, `check`, and `contract`",
    "`pnpm run hosted-ci-validation` for the exact release-candidate commit",
    "attach the final run URL outside the repository commit",
  ],
  requiredPatterns: [
    {
      description: "a numeric hosted CI workflow run id",
      pattern: /Recent hosted CI validation evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a hosted CI workflow timestamp",
      pattern:
        /Recent hosted CI validation evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
    {
      description: "a hosted CI validated source commit sha",
      pattern:
        /Recent hosted CI validation evidence:[\s\S]*validated source commit[\s\S]*`[0-9a-f]{40}`/,
    },
    {
      description: "a direct hosted CI workflow run URL",
      pattern:
        /Recent hosted CI validation evidence:[\s\S]*Run URL:\s*`https:\/\/github\.com\/0disoft\/clarissimi\/actions\/runs\/[0-9]{8,}`\.[\s\S]*Refresh this evidence[\s\S]*attach[\s\S]*outside the repository commit/,
    },
  ],
};

export const rollbackProcedureContract = {
  path: "docs/ops/rollback.md",
  requiredSnippets: [
    "`pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`, `pnpm run smoke`,",
    "`pnpm run check`, `pnpm run contract`, `actionlint`, `ssealed doctor . --json`, YAML parsing,",
    "Delete the temporary staging directory.",
    "git branch --delete clarissimi/recognition/<source-kind>-<source-id>",
    "git push origin --delete clarissimi/recognition/<source-kind>-<source-id>",
    "Close the proposal pull request and delete the proposal branch.",
    "`pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`",
    "do not delete broad `clarissimi/*` patterns",
    "Add `--apply` only after",
    "fails if any matched pull request or branch remains",
    "Clarissimi smoke orphan audit",
    "Revert the recognition pull request",
    "configured rebuild command",
    "Published Action tag with a normal defect",
    "Moving `v0` alias fails verification",
    "Restore `v0` to the SHA recorded before promotion",
    "do not move or overwrite the existing tag.",
    "urgent security or supply-chain incident",
    "old SHA, replacement SHA, affected users, and verification evidence",
    "No database rollback exists in the MVP.",
    ".clarissimi/contributions.jsonl",
    "Derived files should be regenerated from approved contribution records",
  ],
};

export const highRiskSecretEnvNames = [
  "NPM_TOKEN",
  "NODE_AUTH_TOKEN",
  "CLARISSIMI_PROVIDER_TOKEN",
  "OPENAI_API_" + "KEY",
  "ANTHROPIC_API_" + "KEY",
  "GEMINI_API_" + "KEY",
  "DEEPSEEK_API_" + "KEY",
  "OPENCODE_GO_API_" + "KEY",
  "UMANS_API_" + "KEY",
  "GITHUB_TOKEN",
  "GITHUB_PAT",
  "GITHUB_PAT_ODISOFT",
];

export const hostedLiveProviderWorkflowContract = {
  path: ".github/workflows/clarissimi-live-provider-smoke.yml",
  requiredInputs: [
    { name: "provider-model", required: true },
    { name: "provider-endpoint", required: false },
    { name: "provider-thinking", required: false },
    { name: "evidence-id", required: false },
  ],
  requiredSnippets: [
    "workflow_dispatch:",
    "contents: read",
    "Verify provider inputs",
    "Verify evidence correlation id",
    "Verify provider secret",
    "uses: actions/checkout@v7",
    "uses: actions/setup-node@v6",
    "node-version: 24",
    "corepack enable",
    "pnpm install --frozen-lockfile",
    "CLARISSIMI_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "CLARISSIMI_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "CLARISSIMI_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "EVIDENCE_ID: ${{ inputs.evidence-id }}",
  ],
  requiredOrder: [
    "Verify provider inputs",
    "Verify evidence correlation id",
    "Verify provider secret",
    "Checkout repository",
    "Set up Node.js",
    "Install dependencies",
    "Run live provider smoke",
  ],
  forbiddenSnippets: [
    "push:",
    "pull_request:",
    "contents: write",
    "pull-requests: write",
    "issues: write",
  ],
  secretName: "CLARISSIMI_PROVIDER_TOKEN",
  runCommand: "pnpm run live-provider-smoke",
};

export const workflowTrustBoundaryContract = {
  requiredSnippets: ["permissions:"],
  forbiddenSnippets: ["pull_request_target:", "write-all"],
};

export const ciWorkflowContract = {
  path: ".github/workflows/ci.yml",
  requiredTriggers: ["push:", "pull_request:", "workflow_dispatch:"],
  requiredPermissions: ["contents: read"],
  requiredSnippets: [
    "ACTIONLINT_LINUX_AMD64_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    "ACTIONLINT_VERSION: 1.7.12",
    "SSEALED_VERSION: 0.6.8",
    "YQ_LINUX_AMD64_SHA256: fa52a4e758c63d38299163fbdd1edfb4c4963247918bf9c1c5d31d84789eded4",
    "YQ_VERSION: 4.53.3",
    "uses: actions/setup-node@v6",
    "node-version: 24",
    "corepack enable",
    'npm install --global "ssealed@${SSEALED_VERSION}"',
    "sha256sum --check -",
  ],
  requiredCommands: [
    "pnpm install --frozen-lockfile",
    "pnpm run docs",
    "pnpm run release-readiness",
    "pnpm run lint",
    "pnpm run format",
    "pnpm run migration-check",
    "pnpm run smoke",
    "pnpm run check",
    "pnpm run contract",
  ],
};

export const actionManifestContract = {
  path: "action.yml",
  branding: { icon: "award", color: "purple" },
  requiredInputs: [
    { name: "mode", default: "propose" },
    { name: "event-path" },
    { name: "github-fixture" },
    { name: "config-path" },
    { name: "markdown-summary" },
    { name: "include-automation-contributors" },
    { name: "draft-path" },
    { name: "base-branch", default: "main" },
    { name: "remote-name", default: "origin" },
    { name: "staging-dir" },
    { name: "summary-path" },
    { name: "provider" },
    { name: "provider-model" },
    { name: "provider-endpoint" },
    { name: "provider-endpoint-trust" },
    { name: "provider-thinking" },
  ],
  forbiddenInputs: ["github-token", "provider-token", "clarissimi-provider-token"],
  requiredOutputs: [
    "draft-count",
    "proposed-entry-count",
    "skipped-entry-count",
    "mode",
    "input-source",
    "approval-status",
    "redaction-match-count",
    "staged-file-count",
    "proposal-branch",
    "proposal-commit-sha",
    "proposal-pull-request-number",
    "proposal-pull-request-url",
    "proposal-pull-request-action",
    "summary-json-path",
    "direct-commit-branch",
    "direct-commit-base-sha",
    "direct-commit-sha",
    "direct-commit-created",
    "direct-commit-pushed",
  ],
  requiredEnvMappings: [
    "GITHUB_TOKEN: ${{ (inputs.mode == 'propose' || inputs.mode == 'commit' || inputs.mode == 'stage-draft' || inputs.mode == 'promote-draft') && github.token || '' }}",
    "INPUT_MODE: ${{ inputs.mode }}",
    "INPUT_EVENT_PATH: ${{ inputs.event-path }}",
    "INPUT_GITHUB_FIXTURE: ${{ inputs.github-fixture }}",
    "INPUT_CONFIG_PATH: ${{ inputs.config-path }}",
    "INPUT_MARKDOWN_SUMMARY: ${{ inputs.markdown-summary }}",
    "INPUT_INCLUDE_AUTOMATION_CONTRIBUTORS: ${{ inputs.include-automation-contributors }}",
    "INPUT_DRAFT_PATH: ${{ inputs.draft-path }}",
    "INPUT_BASE_BRANCH: ${{ inputs.base-branch }}",
    "INPUT_REMOTE_NAME: ${{ inputs.remote-name }}",
    "INPUT_STAGING_DIR: ${{ inputs.staging-dir }}",
    "INPUT_SUMMARY_PATH: ${{ inputs.summary-path }}",
    "INPUT_PROVIDER: ${{ inputs.provider }}",
    "INPUT_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "INPUT_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "INPUT_PROVIDER_ENDPOINT_TRUST: ${{ inputs.provider-endpoint-trust }}",
    "INPUT_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}",
  ],
  requiredCommands: ['node "$GITHUB_ACTION_PATH/action-dist/index.js"'],
  forbiddenCommands: [
    "corepack enable",
    'pnpm --dir "$GITHUB_ACTION_PATH" install',
    'pnpm --dir "$GITHUB_ACTION_PATH" --filter @clarissimi/action build',
    'node "$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js"',
  ],
};

export const dogfoodWorkflowContracts = [
  {
    path: ".github/workflows/clarissimi-dry-run.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: read",
      "mode: dry-run",
      "github-fixture: fixtures/github-merged-pr-basic.json",
      "summary-path: .clarissimi/dogfood-fixture-summary.json",
      "event-path: fixtures/github-pull-request-merged-event.json",
      'test "${{ steps.fixture.outputs.mode }}" = "dry-run"',
      'test "${{ steps.event.outputs.mode }}" = "dry-run"',
      'test "${{ steps.fixture.outputs.input-source }}" = "github_fixture"',
      'test "${{ steps.event.outputs.input-source }}" = "github_event_path"',
      'test -n "${{ steps.fixture.outputs.summary-json-path }}"',
      'test -f "${{ steps.fixture.outputs.summary-json-path }}"',
      "Summary artifact leaked raw fixture evidence.",
    ],
    forbiddenSnippets: ["contents: write", "pull-requests: write"],
  },
  {
    path: ".github/workflows/clarissimi-propose-fixture.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: write",
      "pull-requests: write",
      "issues: read",
      "fetch-depth: 0",
      "mode: propose",
      "github-fixture: fixtures/github-merged-pr-approved.json",
      "base-branch: ${{ inputs.base-branch }}",
      'test "${{ steps.propose.outputs.proposed-entry-count }}" = "1"',
      'test "${{ steps.propose.outputs.mode }}" = "propose"',
      'test "${{ steps.propose.outputs.approval-status }}" = "approved"',
      'test "${{ steps.propose.outputs.staged-file-count }}" = "4"',
      'test -n "${{ steps.propose.outputs.proposal-pull-request-url }}"',
    ],
    forbiddenSnippets: ["push:", "pull_request:"],
  },
  {
    path: ".github/workflows/clarissimi-stage-draft-fixture.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: write",
      "pull-requests: write",
      "issues: read",
      "fetch-depth: 0",
      "mode: stage-draft",
      "github-fixture: fixtures/github-merged-pr-basic.json",
      "base-branch: ${{ inputs.base-branch }}",
      'test "${{ steps.stage.outputs.proposed-entry-count }}" = "0"',
      'test "${{ steps.stage.outputs.mode }}" = "stage-draft"',
      'test "${{ steps.stage.outputs.approval-status }}" = "draft"',
      'test "${{ steps.stage.outputs.staged-file-count }}" = "1"',
      'test -n "${{ steps.stage.outputs.proposal-pull-request-url }}"',
    ],
    forbiddenSnippets: ["push:", "pull_request:"],
  },
  {
    path: ".github/workflows/clarissimi-promote-draft-fixture.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: write",
      "pull-requests: write",
      "issues: read",
      "fetch-depth: 0",
      "mode: promote-draft",
      "draft-path: .clarissimi/drafts/sample-project-merged_pull_request-42.json",
      "base-branch: ${{ inputs.base-branch }}",
      'test "${{ steps.promote.outputs.proposed-entry-count }}" = "1"',
      'test "${{ steps.promote.outputs.mode }}" = "promote-draft"',
      'test "${{ steps.promote.outputs.input-source }}" = "approved_draft"',
      'test "${{ steps.promote.outputs.approval-status }}" = "approved"',
      'test "${{ steps.promote.outputs.staged-file-count }}" = "4"',
      'test -n "${{ steps.promote.outputs.proposal-pull-request-url }}"',
    ],
    forbiddenSnippets: ["push:", "pull_request:"],
  },
];

export async function runReleaseReadiness(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const workflowDir = join(repoRoot, ".github", "workflows");
  const workflowFiles = await listFiles(
    workflowDir,
    (name) => name.endsWith(".yml") || name.endsWith(".yaml"),
    repoRoot,
  );
  const yamlFiles = ["action.yml", ...workflowFiles.map((file) => toRepoPath(repoRoot, file))];

  await runCheck({
    repoRoot,
    name: "docs validation",
    command: process.execPath,
    args: ["scripts/validate-docs.mjs"],
  });

  await runPackageScriptRegistrationCheck(repoRoot);
  await runFormatterContractCheck(repoRoot);
  await runMigrationCompatibilityContractCheck(repoRoot);
  await runRootPackageManagerContractCheck(repoRoot);
  await runSmokePackCandidateContractCheck(repoRoot);
  await runWorkspaceContractCheck(repoRoot);
  await runPackageReleasePolicyCheck(repoRoot);
  await runWorkspacePackageReleasePolicyCheck(repoRoot);
  await runReleasePolicyDocumentContractCheck(repoRoot);
  await runProductPositioningContractCheck(repoRoot);
  await runReadmeValidationContractCheck(repoRoot);
  await runDocsValidationScriptContractCheck(repoRoot);
  await runLintAndFormatDecisionDocumentContractCheck(repoRoot);
  await runLedgerFormatDocumentContractCheck(repoRoot);
  await runCliCommandContractCheck(repoRoot);
  await runCliOutputExitCodesDocumentContractCheck(repoRoot);
  await runCliConfigurationDocumentContractCheck(repoRoot);
  await runAgentAssistedDraftsDocumentContractCheck(repoRoot);
  await runCiOperationalDocumentContractCheck(repoRoot);
  await runOperationalContractDocumentContractCheck(repoRoot);
  await runObservabilityDocumentContractCheck(repoRoot);
  await runServiceLevelsDocumentContractCheck(repoRoot);
  await runSecretsDocumentContractCheck(repoRoot);
  await runBackupRestoreDocumentContractCheck(repoRoot);
  await runIncidentResponseDocumentContractCheck(repoRoot);
  await runDisasterRecoveryDocumentContractCheck(repoRoot);
  await runActionInputsOutputsDocumentContractCheck(repoRoot);
  await runActionContractDocumentContractCheck(repoRoot);
  await runActionPermissionsDocumentContractCheck(repoRoot);
  await runOpsValidationFooterContractCheck(repoRoot);
  await runEngineeringValidationDocumentContractCheck(repoRoot);
  await runMonorepoValidationDocumentContractCheck(repoRoot);
  await runTsconfigBuildGraphCheck(repoRoot);
  await runPackageOwnershipContractCheck(repoRoot);
  await runHostedCiEvidenceCheck(repoRoot);
  await runDryRunDogfoodEvidenceCheck(repoRoot);
  await runWriteModeDogfoodEvidenceCheck(repoRoot);
  await runCredentialedReleaseEvidenceCheck(repoRoot);
  await runRollbackProcedureContractCheck(repoRoot);
  await runToolAvailabilityCheck(repoRoot);

  await runCheck({
    repoRoot,
    name: "ssealed doctor",
    command: "ssealed",
    args: ["doctor", ".", "--json"],
    validate({ stdout }) {
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (error) {
        throw new Error(`ssealed doctor did not emit parseable JSON: ${error.message}`);
      }

      if (result.ok !== true) {
        throw new Error("ssealed doctor reported ok=false.");
      }
    },
  });

  await runCheck({
    repoRoot,
    name: "workflow actionlint",
    command: "actionlint",
    args: workflowFiles.map((file) => toRepoPath(repoRoot, file)),
  });

  for (const file of yamlFiles) {
    await runCheck({
      repoRoot,
      name: `yaml parse: ${file}`,
      command: "yq",
      args: ["eval", ".", file],
      redactOutput: true,
    });
  }

  await runActionManifestContractCheck(repoRoot);
  await runWorkflowTrustBoundaryContractCheck(repoRoot, workflowFiles);
  await runCiWorkflowContractCheck(repoRoot);
  await runDogfoodWorkflowContractChecks(repoRoot);
  await runHostedLiveProviderWorkflowContractCheck(repoRoot);

  await runCheck({
    repoRoot,
    name: "Action bundle freshness",
    command: "pnpm",
    args: ["run", "bundle:action:check"],
  });

  await runCheck({
    repoRoot,
    name: "git diff whitespace check",
    command: "git",
    args: ["diff", "--check"],
  });

  await runTrackedGeneratedOutputCheck(repoRoot);
  await runSecretScan(repoRoot);

  console.log("release readiness static gates passed");
  console.log(
    "hosted CI, dry-run, write-mode, and credentialed release evidence recorded in docs/ops/release.md",
  );
  console.log("immutable v0.x.y Action tags are allowed by ADR 0044 after all release gates pass");
  console.log(
    "moving Action alias v0 is allowed by ADR 0034 after exact-SHA post-promotion verification",
  );
  console.log(
    "free root Action Marketplace publication is allowed by ADR 0045; public package publication remains blocked",
  );
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runReleaseReadiness();
}

async function runCheck(options) {
  const result = await runCommand(options.command, options.args, options.repoRoot);
  if (result.exitCode !== 0) {
    const stdout = options.redactOutput ? "[redacted]" : result.stdout.trim();
    const stderr = options.redactOutput ? "[redacted]" : result.stderr.trim();
    throw new Error(
      `${options.name} failed with exit code ${result.exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }

  if (options.validate !== undefined) {
    options.validate(result);
  }

  console.log(`${options.name} passed`);
}

function runCommand(command, args, repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function runSecretScan(repoRoot) {
  const files = await listFiles(repoRoot, () => true, repoRoot);
  const hits = [];

  for (const file of files) {
    const repoPath = toRepoPath(repoRoot, file);
    if (shouldSkipSecretScanPath(repoPath)) {
      continue;
    }

    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }

    hits.push(...findHighRiskSecretLines(repoPath, text));
  }

  if (hits.length > 0) {
    throw new Error(`secret scan found high-risk patterns:\n${hits.join("\n")}`);
  }

  console.log("secret scan passed");
}

export function findHighRiskSecretLines(repoPath, text) {
  const highRiskEnvAssignments = highRiskSecretEnvNames.map((name) => `${escapeRegExp(name)}\\s*=`);
  const pattern = new RegExp(
    [
      "sk-(proj|live|test|ant|svc|admin|user|org|key)-[A-Za-z0-9_-]{8,}",
      "ghp_[A-Za-z0-9]{20,}",
      "BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY",
      ...highRiskEnvAssignments,
    ].join("|"),
  );
  const lines = text.split(/\r?\n/);
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      hits.push(`${repoPath}:${index + 1}`);
    }
  }

  return hits;
}

export function validateHostedLiveProviderWorkflowContract(
  text,
  contract = hostedLiveProviderWorkflowContract,
) {
  const issues = [];

  for (const input of contract.requiredInputs) {
    const block = findYamlMappingBlock(text, input.name);
    if (block === undefined) {
      issues.push(`${contract.path} must define workflow_dispatch input ${input.name}.`);
      continue;
    }

    const requiredValue = findYamlScalarValue(block, "required");
    const expected = String(input.required);
    if (requiredValue !== expected) {
      issues.push(`${contract.path} input ${input.name} must set required: ${expected}.`);
    }
  }

  if (!text.includes(`secrets.${contract.secretName}`)) {
    issues.push(`${contract.path} must read secrets.${contract.secretName}.`);
  }

  if (!text.includes(contract.runCommand)) {
    issues.push(`${contract.path} must run ${contract.runCommand}.`);
  }

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  for (const snippet of contract.forbiddenSnippets) {
    if (text.includes(snippet)) {
      issues.push(`${contract.path} must not include ${snippet}.`);
    }
  }

  issues.push(...validateSnippetOrder(text, contract.path, contract.requiredOrder));

  return issues;
}

export function validateWorkflowTrustBoundaryContract(
  text,
  path,
  contract = workflowTrustBoundaryContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${path} must include ${snippet}.`);
    }
  }

  for (const snippet of contract.forbiddenSnippets) {
    if (text.includes(snippet)) {
      issues.push(`${path} must not include ${snippet}.`);
    }
  }

  return issues;
}

export function validateRollbackProcedureContract(text, contract = rollbackProcedureContract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateReleasePolicyDocumentContract(
  text,
  contract = releasePolicyDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateProductPositioningContract(
  textsByPath,
  contract = productPositioningContract,
) {
  const issues = [];

  for (const document of contract.documents) {
    const text = textsByPath[document.path];
    if (typeof text !== "string") {
      issues.push(`${document.path} must be readable for product positioning contract.`);
      continue;
    }

    for (const snippet of document.requiredSnippets) {
      if (!text.includes(snippet)) {
        issues.push(`${document.path} must include ${snippet}.`);
      }
    }

    for (const snippet of document.forbiddenSnippets) {
      if (text.includes(snippet)) {
        issues.push(`${document.path} must not include ${snippet}.`);
      }
    }
  }

  return issues;
}

export function validateReadmeValidationContract(text, contract = readmeValidationContract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  const orderedSnippets = contract.orderedSnippets ?? [];
  for (let index = 1; index < orderedSnippets.length; index += 1) {
    const previous = orderedSnippets[index - 1];
    const current = orderedSnippets[index];
    const previousOffset = text.indexOf(previous);
    const currentOffset = text.indexOf(current);
    if (previousOffset !== -1 && currentOffset !== -1 && previousOffset > currentOffset) {
      issues.push(`${contract.path} must keep ${previous} before ${current}.`);
    }
  }

  return issues;
}

export function validateDocsValidationScriptContract(
  text,
  contract = docsValidationScriptContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateLintAndFormatDecisionDocumentContract(
  text,
  contract = lintAndFormatDecisionDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateLedgerFormatDocumentContract(
  text,
  contract = ledgerFormatDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateCliCommandContract(text, contract = cliCommandContract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateCliOutputExitCodesDocumentContract(
  text,
  contract = cliOutputExitCodesDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateCliConfigurationDocumentContract(
  text,
  contract = cliConfigurationDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateAgentAssistedDraftsDocumentContract(
  text,
  contract = agentAssistedDraftsDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateCiOperationalDocumentContract(
  text,
  contract = ciOperationalDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateOperationalContractDocumentContract(
  text,
  contract = operationalContractDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateObservabilityDocumentContract(
  text,
  contract = observabilityDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateServiceLevelsDocumentContract(
  text,
  contract = serviceLevelsDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateIncidentResponseDocumentContract(
  text,
  contract = incidentResponseDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateDisasterRecoveryDocumentContract(
  text,
  contract = disasterRecoveryDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateSecretsDocumentContract(text, contract = secretsDocumentContract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateBackupRestoreDocumentContract(
  text,
  contract = backupRestoreDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateActionInputsOutputsDocumentContract(
  text,
  contract = actionInputsOutputsDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateActionContractDocumentContract(
  text,
  contract = actionContractDocumentContract,
) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateActionPermissionsDocumentContract(
  text,
  contract = actionPermissionsDocumentContract,
) {
  const issues = [];
  const normalizedTableRows = text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map(normalizeMarkdownTableRow);

  for (const snippet of contract.requiredSnippets) {
    const present = snippet.startsWith("|")
      ? normalizedTableRows.includes(normalizeMarkdownTableRow(snippet))
      : text.includes(snippet);
    if (!present) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

function normalizeMarkdownTableRow(line) {
  return line
    .trim()
    .split("|")
    .map((cell) => cell.trim())
    .join(" | ");
}

export function validateOpsValidationFooterContract(
  textsByPath,
  contract = opsValidationFooterContract,
) {
  const issues = [];

  for (const documentPath of contract.documents) {
    const text = textsByPath[documentPath];
    if (typeof text !== "string") {
      issues.push(`${documentPath} must be readable for ops validation footer contract.`);
      continue;
    }

    for (const snippet of contract.requiredSnippets) {
      if (!text.includes(snippet)) {
        issues.push(`${documentPath} must include ${snippet}.`);
      }
    }
  }

  return issues;
}

export function validateEngineeringValidationDocumentContract(
  textsByPath,
  contract = engineeringValidationDocumentContract,
) {
  const issues = [];

  for (const documentPath of contract.documents) {
    const text = textsByPath[documentPath];
    if (typeof text !== "string") {
      issues.push(`${documentPath} must be readable for engineering validation document contract.`);
      continue;
    }

    for (const snippet of contract.requiredSnippets) {
      if (!text.includes(snippet)) {
        issues.push(`${documentPath} must include ${snippet}.`);
      }
    }
  }

  return issues;
}

export function validateMonorepoValidationDocumentContract(
  textsByPath,
  contract = monorepoValidationDocumentContract,
) {
  const issues = [];

  for (const documentPath of contract.documents) {
    const text = textsByPath[documentPath];
    if (typeof text !== "string") {
      issues.push(`${documentPath} must be readable for monorepo validation document contract.`);
      continue;
    }

    for (const snippet of contract.requiredSnippets) {
      if (!text.includes(snippet)) {
        issues.push(`${documentPath} must include ${snippet}.`);
      }
    }
  }

  return issues;
}

export function validateCiWorkflowContract(text, contract = ciWorkflowContract) {
  const issues = [];

  for (const trigger of contract.requiredTriggers) {
    if (!text.includes(trigger)) {
      issues.push(`${contract.path} must define ${trigger} trigger.`);
    }
  }

  for (const permission of contract.requiredPermissions) {
    if (!text.includes(permission)) {
      issues.push(`${contract.path} must set ${permission}.`);
    }
  }

  for (const command of contract.requiredCommands) {
    if (!text.includes(command)) {
      issues.push(`${contract.path} must run ${command}.`);
    }
  }

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateActionManifestContract(text, contract = actionManifestContract) {
  const issues = [];
  const brandingBlock = findRequiredYamlMappingBlock(text, contract.path, "branding", issues);
  const inputsBlock = findRequiredYamlMappingBlock(text, contract.path, "inputs", issues);
  const outputsBlock = findRequiredYamlMappingBlock(text, contract.path, "outputs", issues);

  if (brandingBlock !== undefined) {
    for (const [key, expected] of Object.entries(contract.branding ?? {})) {
      const value = findYamlScalarValue(brandingBlock, key);
      if (value !== expected) {
        issues.push(`${contract.path} branding ${key} must be ${expected}.`);
      }
    }
  }

  for (const input of contract.requiredInputs) {
    const block =
      inputsBlock === undefined ? undefined : findYamlMappingBlock(inputsBlock, input.name);
    if (block === undefined) {
      issues.push(`${contract.path} must define input ${input.name}.`);
      continue;
    }

    if (input.default !== undefined) {
      const defaultValue = findYamlScalarValue(block, "default");
      if (defaultValue !== input.default) {
        issues.push(`${contract.path} input ${input.name} must set default: ${input.default}.`);
      }
    }
  }

  for (const inputName of contract.forbiddenInputs) {
    if (inputsBlock !== undefined && findYamlMappingBlock(inputsBlock, inputName) !== undefined) {
      issues.push(`${contract.path} must not expose ${inputName} as an action input.`);
    }
  }

  for (const output of contract.requiredOutputs) {
    const block =
      outputsBlock === undefined ? undefined : findYamlMappingBlock(outputsBlock, output);
    if (block === undefined) {
      issues.push(`${contract.path} must define output ${output}.`);
      continue;
    }

    const expectedValue = `\${{ steps.clarissimi.outputs.${output} }}`;
    const value = findYamlScalarValue(block, "value");
    if (value !== expectedValue) {
      issues.push(`${contract.path} output ${output} must map to ${expectedValue}.`);
    }
  }

  for (const mapping of contract.requiredEnvMappings) {
    if (!text.includes(mapping)) {
      issues.push(`${contract.path} must include env mapping ${mapping}.`);
    }
  }

  for (const command of contract.requiredCommands) {
    if (!text.includes(command)) {
      issues.push(`${contract.path} must run ${command}.`);
    }
  }

  for (const command of contract.forbiddenCommands ?? []) {
    if (text.includes(command)) {
      issues.push(`${contract.path} must not run ${command}.`);
    }
  }

  return issues;
}

export function validateDogfoodWorkflowContract(text, contract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  for (const snippet of contract.forbiddenSnippets ?? []) {
    if (text.includes(snippet)) {
      issues.push(`${contract.path} must not include ${snippet}.`);
    }
  }

  return issues;
}

async function runDogfoodWorkflowContractChecks(repoRoot) {
  const issues = [];

  for (const contract of dogfoodWorkflowContracts) {
    const workflowPath = join(repoRoot, contract.path);
    let text;
    try {
      text = await readFile(workflowPath, "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${contract.path}: ${error.message}`);
    }

    issues.push(...validateDogfoodWorkflowContract(text, contract));
  }

  if (issues.length > 0) {
    throw new Error(`dogfood workflow contract failed:\n${issues.join("\n")}`);
  }

  console.log("dogfood workflow contract passed");
}

async function runActionManifestContractCheck(repoRoot) {
  const actionPath = join(repoRoot, actionManifestContract.path);
  let text;
  try {
    text = await readFile(actionPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${actionManifestContract.path}: ${error.message}`);
  }

  const issues = validateActionManifestContract(text);
  if (issues.length > 0) {
    throw new Error(`Action manifest contract failed:\n${issues.join("\n")}`);
  }

  console.log("Action manifest contract passed");
}

async function runWorkflowTrustBoundaryContractCheck(repoRoot, workflowFiles) {
  const issues = [];

  for (const file of workflowFiles) {
    const path = toRepoPath(repoRoot, file);
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${path}: ${error.message}`);
    }

    issues.push(...validateWorkflowTrustBoundaryContract(text, path));
  }

  if (issues.length > 0) {
    throw new Error(`workflow trust boundary contract failed:\n${issues.join("\n")}`);
  }

  console.log("workflow trust boundary contract passed");
}

async function runCiWorkflowContractCheck(repoRoot) {
  const workflowPath = join(repoRoot, ciWorkflowContract.path);
  let text;
  try {
    text = await readFile(workflowPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${ciWorkflowContract.path}: ${error.message}`);
  }

  const issues = validateCiWorkflowContract(text);
  if (issues.length > 0) {
    throw new Error(`CI workflow contract failed:\n${issues.join("\n")}`);
  }

  console.log("CI workflow contract passed");
}

async function runHostedLiveProviderWorkflowContractCheck(repoRoot) {
  const workflowPath = join(repoRoot, hostedLiveProviderWorkflowContract.path);
  let text;
  try {
    text = await readFile(workflowPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${hostedLiveProviderWorkflowContract.path}: ${error.message}`);
  }

  const issues = validateHostedLiveProviderWorkflowContract(text);
  if (issues.length > 0) {
    throw new Error(`hosted live provider workflow contract failed:\n${issues.join("\n")}`);
  }

  console.log("hosted live provider workflow contract passed");
}

async function runToolAvailabilityCheck(repoRoot) {
  const tools = [
    {
      name: "ssealed",
      command: "ssealed",
      args: ["--version"],
      installHint: "Install ssealed before running release readiness.",
    },
    {
      name: "actionlint",
      command: "actionlint",
      args: ["-version"],
      installHint: "Install actionlint before running release readiness.",
    },
    {
      name: "yq",
      command: "yq",
      args: ["--version"],
      installHint: "Install mikefarah/yq before running release readiness.",
    },
  ];

  for (const tool of tools) {
    let result;
    try {
      result = await runCommand(tool.command, tool.args, repoRoot);
    } catch (error) {
      throw new Error(
        `${tool.name} is required but could not be started. ${tool.installHint} ${error.message}`,
      );
    }

    if (result.exitCode !== 0) {
      throw new Error(
        `${tool.name} availability check failed with exit code ${result.exitCode}. ${tool.installHint}\n` +
          `STDERR:\n${result.stderr.trim()}`,
      );
    }
  }

  console.log("release readiness tool availability passed");
}

async function runRollbackProcedureContractCheck(repoRoot) {
  const rollbackPath = join(repoRoot, rollbackProcedureContract.path);
  let text;
  try {
    text = await readFile(rollbackPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${rollbackProcedureContract.path}: ${error.message}`);
  }

  const issues = validateRollbackProcedureContract(text);
  if (issues.length > 0) {
    throw new Error(`rollback procedure contract failed:\n${issues.join("\n")}`);
  }

  console.log("rollback procedure contract passed");
}

async function runPackageScriptRegistrationCheck(repoRoot) {
  const packageJsonPath = join(repoRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json is not parseable JSON: ${error.message}`);
  }

  const issues = validatePackageScriptRegistration(packageJson);
  if (issues.length > 0) {
    throw new Error(`package.json script registration failed:\n${issues.join("\n")}`);
  }

  console.log("package script registration passed");
}

async function runRootPackageManagerContractCheck(repoRoot) {
  const packageJsonPath = join(repoRoot, rootPackageManagerContract.path);
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`${rootPackageManagerContract.path} is not parseable JSON: ${error.message}`);
  }

  const issues = validateRootPackageManager(packageJson);
  if (issues.length > 0) {
    throw new Error(`root package manager contract failed:\n${issues.join("\n")}`);
  }

  console.log("root package manager contract passed");
}

async function runFormatterContractCheck(repoRoot) {
  let packageJson;
  let config;
  try {
    packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    config = JSON.parse(await readFile(join(repoRoot, formatterContract.configPath), "utf8"));
  } catch (error) {
    throw new Error(`formatter contract files are invalid or unreadable: ${error.message}`);
  }

  const issues = validateFormatterContract(packageJson, config);
  if (issues.length > 0) {
    throw new Error(`formatter contract failed:\n${issues.join("\n")}`);
  }

  console.log("formatter contract passed");
}

async function runMigrationCompatibilityContractCheck(repoRoot) {
  const textsByPath = {};
  let manifest;
  try {
    for (const document of migrationCompatibilityContract.documents) {
      textsByPath[document.path] = await readFile(join(repoRoot, document.path), "utf8");
    }
    manifest = JSON.parse(
      await readFile(join(repoRoot, migrationCompatibilityContract.manifestPath), "utf8"),
    );
  } catch (error) {
    throw new Error(`migration compatibility contract files are invalid: ${error.message}`);
  }

  const issues = validateMigrationCompatibilityContract(textsByPath, manifest);
  if (issues.length > 0) {
    throw new Error(`migration compatibility contract failed:\n${issues.join("\n")}`);
  }

  console.log("migration compatibility contract passed");
}

async function runPackageReleasePolicyCheck(repoRoot) {
  const packageJsonPath = join(repoRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json is not parseable JSON: ${error.message}`);
  }

  const issues = validatePackageReleasePolicy(packageJson);
  if (issues.length > 0) {
    throw new Error(`package.json release policy failed:\n${issues.join("\n")}`);
  }

  console.log("package release policy passed");
}

async function runReleasePolicyDocumentContractCheck(repoRoot) {
  const releasePath = join(repoRoot, releasePolicyDocumentContract.path);
  let text;
  try {
    text = await readFile(releasePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${releasePolicyDocumentContract.path}: ${error.message}`);
  }

  const issues = validateReleasePolicyDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`release policy document contract failed:\n${issues.join("\n")}`);
  }

  console.log("release policy document contract passed");
}

async function runProductPositioningContractCheck(repoRoot) {
  const textsByPath = {};

  for (const document of productPositioningContract.documents) {
    const documentPath = join(repoRoot, document.path);
    try {
      textsByPath[document.path] = await readFile(documentPath, "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${document.path}: ${error.message}`);
    }
  }

  const issues = validateProductPositioningContract(textsByPath);
  if (issues.length > 0) {
    throw new Error(`product positioning contract failed:\n${issues.join("\n")}`);
  }

  console.log("product positioning contract passed");
}

async function runReadmeValidationContractCheck(repoRoot) {
  const readmePath = join(repoRoot, readmeValidationContract.path);
  let text;
  try {
    text = await readFile(readmePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${readmeValidationContract.path}: ${error.message}`);
  }

  const issues = validateReadmeValidationContract(text);
  if (issues.length > 0) {
    throw new Error(`README validation contract failed:\n${issues.join("\n")}`);
  }

  console.log("README validation contract passed");
}

async function runDocsValidationScriptContractCheck(repoRoot) {
  const docsValidationPath = join(repoRoot, docsValidationScriptContract.path);
  let text;
  try {
    text = await readFile(docsValidationPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${docsValidationScriptContract.path}: ${error.message}`);
  }

  const issues = validateDocsValidationScriptContract(text);
  if (issues.length > 0) {
    throw new Error(`docs validation script contract failed:\n${issues.join("\n")}`);
  }

  console.log("docs validation script contract passed");
}

async function runLintAndFormatDecisionDocumentContractCheck(repoRoot) {
  const lintAndFormatPath = join(repoRoot, lintAndFormatDecisionDocumentContract.path);
  let text;
  try {
    text = await readFile(lintAndFormatPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read ${lintAndFormatDecisionDocumentContract.path}: ${error.message}`,
    );
  }

  const issues = validateLintAndFormatDecisionDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`lint and format decision document contract failed:\n${issues.join("\n")}`);
  }

  console.log("lint and format decision document contract passed");
}

async function runLedgerFormatDocumentContractCheck(repoRoot) {
  const ledgerFormatPath = join(repoRoot, ledgerFormatDocumentContract.path);
  let text;
  try {
    text = await readFile(ledgerFormatPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${ledgerFormatDocumentContract.path}: ${error.message}`);
  }

  const issues = validateLedgerFormatDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`ledger format document contract failed:\n${issues.join("\n")}`);
  }

  console.log("ledger format document contract passed");
}

async function runCliCommandContractCheck(repoRoot) {
  const commandContractPath = join(repoRoot, cliCommandContract.path);
  let text;
  try {
    text = await readFile(commandContractPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${cliCommandContract.path}: ${error.message}`);
  }

  const issues = validateCliCommandContract(text);
  if (issues.length > 0) {
    throw new Error(`CLI command contract failed:\n${issues.join("\n")}`);
  }

  console.log("CLI command contract passed");
}

async function runCliOutputExitCodesDocumentContractCheck(repoRoot) {
  const outputExitCodesPath = join(repoRoot, cliOutputExitCodesDocumentContract.path);
  let text;
  try {
    text = await readFile(outputExitCodesPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${cliOutputExitCodesDocumentContract.path}: ${error.message}`);
  }

  const issues = validateCliOutputExitCodesDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`CLI output and exit codes document contract failed:\n${issues.join("\n")}`);
  }

  console.log("CLI output and exit codes document contract passed");
}

async function runCliConfigurationDocumentContractCheck(repoRoot) {
  const configurationPath = join(repoRoot, cliConfigurationDocumentContract.path);
  let text;
  try {
    text = await readFile(configurationPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${cliConfigurationDocumentContract.path}: ${error.message}`);
  }

  const issues = validateCliConfigurationDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`CLI configuration document contract failed:\n${issues.join("\n")}`);
  }

  console.log("CLI configuration document contract passed");
}

async function runAgentAssistedDraftsDocumentContractCheck(repoRoot) {
  const agentAssistedDraftsPath = join(repoRoot, agentAssistedDraftsDocumentContract.path);
  let text;
  try {
    text = await readFile(agentAssistedDraftsPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${agentAssistedDraftsDocumentContract.path}: ${error.message}`);
  }

  const issues = validateAgentAssistedDraftsDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`agent-assisted drafts document contract failed:\n${issues.join("\n")}`);
  }

  console.log("agent-assisted drafts document contract passed");
}

async function runCiOperationalDocumentContractCheck(repoRoot) {
  const ciPath = join(repoRoot, ciOperationalDocumentContract.path);
  let text;
  try {
    text = await readFile(ciPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${ciOperationalDocumentContract.path}: ${error.message}`);
  }

  const issues = validateCiOperationalDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`CI operational document contract failed:\n${issues.join("\n")}`);
  }

  console.log("CI operational document contract passed");
}

async function runOperationalContractDocumentContractCheck(repoRoot) {
  const operationalContractPath = join(repoRoot, operationalContractDocumentContract.path);
  let text;
  try {
    text = await readFile(operationalContractPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${operationalContractDocumentContract.path}: ${error.message}`);
  }

  const issues = validateOperationalContractDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`operational contract document contract failed:\n${issues.join("\n")}`);
  }

  console.log("operational contract document contract passed");
}

async function runObservabilityDocumentContractCheck(repoRoot) {
  const observabilityPath = join(repoRoot, observabilityDocumentContract.path);
  let text;
  try {
    text = await readFile(observabilityPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${observabilityDocumentContract.path}: ${error.message}`);
  }

  const issues = validateObservabilityDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`observability document contract failed:\n${issues.join("\n")}`);
  }

  console.log("observability document contract passed");
}

async function runServiceLevelsDocumentContractCheck(repoRoot) {
  const serviceLevelsPath = join(repoRoot, serviceLevelsDocumentContract.path);
  let text;
  try {
    text = await readFile(serviceLevelsPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${serviceLevelsDocumentContract.path}: ${error.message}`);
  }

  const issues = validateServiceLevelsDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`service levels document contract failed:\n${issues.join("\n")}`);
  }

  console.log("service levels document contract passed");
}

async function runSecretsDocumentContractCheck(repoRoot) {
  const secretsPath = join(repoRoot, secretsDocumentContract.path);
  let text;
  try {
    text = await readFile(secretsPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${secretsDocumentContract.path}: ${error.message}`);
  }

  const issues = validateSecretsDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`secrets document contract failed:\n${issues.join("\n")}`);
  }

  console.log("secrets document contract passed");
}

async function runBackupRestoreDocumentContractCheck(repoRoot) {
  const backupRestorePath = join(repoRoot, backupRestoreDocumentContract.path);
  let text;
  try {
    text = await readFile(backupRestorePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${backupRestoreDocumentContract.path}: ${error.message}`);
  }

  const issues = validateBackupRestoreDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`backup and restore document contract failed:\n${issues.join("\n")}`);
  }

  console.log("backup and restore document contract passed");
}

async function runIncidentResponseDocumentContractCheck(repoRoot) {
  const incidentResponsePath = join(repoRoot, incidentResponseDocumentContract.path);
  let text;
  try {
    text = await readFile(incidentResponsePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${incidentResponseDocumentContract.path}: ${error.message}`);
  }

  const issues = validateIncidentResponseDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`incident response document contract failed:\n${issues.join("\n")}`);
  }

  console.log("incident response document contract passed");
}

async function runDisasterRecoveryDocumentContractCheck(repoRoot) {
  const disasterRecoveryPath = join(repoRoot, disasterRecoveryDocumentContract.path);
  let text;
  try {
    text = await readFile(disasterRecoveryPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${disasterRecoveryDocumentContract.path}: ${error.message}`);
  }

  const issues = validateDisasterRecoveryDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`disaster recovery document contract failed:\n${issues.join("\n")}`);
  }

  console.log("disaster recovery document contract passed");
}

async function runActionInputsOutputsDocumentContractCheck(repoRoot) {
  const inputsOutputsPath = join(repoRoot, actionInputsOutputsDocumentContract.path);
  let text;
  try {
    text = await readFile(inputsOutputsPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${actionInputsOutputsDocumentContract.path}: ${error.message}`);
  }

  const issues = validateActionInputsOutputsDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`Action inputs and outputs document contract failed:\n${issues.join("\n")}`);
  }

  console.log("Action inputs and outputs document contract passed");
}

async function runActionContractDocumentContractCheck(repoRoot) {
  const actionContractPath = join(repoRoot, actionContractDocumentContract.path);
  let text;
  try {
    text = await readFile(actionContractPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${actionContractDocumentContract.path}: ${error.message}`);
  }

  const issues = validateActionContractDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`Action contract document contract failed:\n${issues.join("\n")}`);
  }

  console.log("Action contract document contract passed");
}

async function runActionPermissionsDocumentContractCheck(repoRoot) {
  const actionPermissionsPath = join(repoRoot, actionPermissionsDocumentContract.path);
  let text;
  try {
    text = await readFile(actionPermissionsPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${actionPermissionsDocumentContract.path}: ${error.message}`);
  }

  const issues = validateActionPermissionsDocumentContract(text);
  if (issues.length > 0) {
    throw new Error(`Action permissions document contract failed:\n${issues.join("\n")}`);
  }

  console.log("Action permissions document contract passed");
}

async function runOpsValidationFooterContractCheck(repoRoot) {
  const textsByPath = {};

  for (const documentPath of opsValidationFooterContract.documents) {
    try {
      textsByPath[documentPath] = await readFile(join(repoRoot, documentPath), "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${documentPath}: ${error.message}`);
    }
  }

  const issues = validateOpsValidationFooterContract(textsByPath);
  if (issues.length > 0) {
    throw new Error(`ops validation footer contract failed:\n${issues.join("\n")}`);
  }

  console.log("ops validation footer contract passed");
}

async function runEngineeringValidationDocumentContractCheck(repoRoot) {
  const textsByPath = {};

  for (const documentPath of engineeringValidationDocumentContract.documents) {
    try {
      textsByPath[documentPath] = await readFile(join(repoRoot, documentPath), "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${documentPath}: ${error.message}`);
    }
  }

  const issues = validateEngineeringValidationDocumentContract(textsByPath);
  if (issues.length > 0) {
    throw new Error(`engineering validation document contract failed:\n${issues.join("\n")}`);
  }

  console.log("engineering validation document contract passed");
}

async function runMonorepoValidationDocumentContractCheck(repoRoot) {
  const textsByPath = {};

  for (const documentPath of monorepoValidationDocumentContract.documents) {
    try {
      textsByPath[documentPath] = await readFile(join(repoRoot, documentPath), "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${documentPath}: ${error.message}`);
    }
  }

  const issues = validateMonorepoValidationDocumentContract(textsByPath);
  if (issues.length > 0) {
    throw new Error(`monorepo validation document contract failed:\n${issues.join("\n")}`);
  }

  console.log("monorepo validation document contract passed");
}

async function runSmokePackCandidateContractCheck(repoRoot) {
  const smokePath = join(repoRoot, smokePackCandidateContract.path);
  let text;
  try {
    text = await readFile(smokePath, "utf8");
  } catch (error) {
    throw new Error(`${smokePackCandidateContract.path} is not readable: ${error.message}`);
  }

  const issues = validateSmokePackCandidateContract(text);
  if (issues.length > 0) {
    throw new Error(`smoke package pack candidate contract failed:\n${issues.join("\n")}`);
  }

  console.log("smoke package pack candidate contract passed");
}

async function runWorkspacePackageReleasePolicyCheck(repoRoot) {
  const packageManifestPaths = await listWorkspacePackageManifests(repoRoot);
  const issues = [];

  for (const packageJsonPath of packageManifestPaths) {
    let packageJson;
    const repoPath = toRepoPath(repoRoot, packageJsonPath);
    try {
      packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    } catch (error) {
      issues.push(`${repoPath} is not parseable JSON: ${error.message}`);
      continue;
    }

    issues.push(...validatePackageReleasePolicy(packageJson, packageReleasePolicy, repoPath));
    issues.push(
      ...validateWorkspacePackageManifest(
        packageJson,
        workspaceDirFromManifestPath(repoRoot, packageJsonPath),
        repoPath,
      ),
    );
    issues.push(
      ...validateWorkspacePackageManifestSurface(
        packageJson,
        workspaceDirFromManifestPath(repoRoot, packageJsonPath),
        repoPath,
      ),
    );
    issues.push(
      ...validateWorkspaceInternalDependencies(
        packageJson,
        workspaceDirFromManifestPath(repoRoot, packageJsonPath),
        repoPath,
      ),
    );
  }

  if (issues.length > 0) {
    throw new Error(`workspace package release policy failed:\n${issues.join("\n")}`);
  }

  console.log("workspace package release policy passed");
}

async function runTrackedGeneratedOutputCheck(repoRoot) {
  const result = await runCommand("git", ["ls-files"], repoRoot);
  if (result.exitCode !== 0) {
    throw new Error(
      `tracked generated output check failed to list tracked files.\nSTDOUT:\n${result.stdout.trim()}\nSTDERR:\n${result.stderr.trim()}`,
    );
  }

  const paths = result.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const issues = validateTrackedGeneratedOutputPaths(paths);
  if (issues.length > 0) {
    throw new Error(`tracked generated output check failed:\n${issues.join("\n")}`);
  }

  console.log("tracked generated output check passed");
}

async function runTsconfigBuildGraphCheck(repoRoot) {
  const packageDirs = await listWorkspacePackageDirs(repoRoot);
  const issues = [];

  let rootTsconfig;
  try {
    rootTsconfig = JSON.parse(
      await readFile(join(repoRoot, tsconfigBuildGraphContract.path), "utf8"),
    );
  } catch (error) {
    throw new Error(`${tsconfigBuildGraphContract.path} is not parseable JSON: ${error.message}`);
  }

  issues.push(...validateRootTsconfigReferences(rootTsconfig, packageDirs));

  for (const packageDir of packageDirs) {
    const tsconfigPath = join(repoRoot, "packages", packageDir, "tsconfig.json");
    const repoPath = toRepoPath(repoRoot, tsconfigPath);
    let tsconfig;
    try {
      tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8"));
    } catch (error) {
      issues.push(`${repoPath} is not parseable JSON: ${error.message}`);
      continue;
    }

    issues.push(...validateWorkspacePackageTsconfigReferences(tsconfig, packageDir, repoPath));
  }

  if (issues.length > 0) {
    throw new Error(`tsconfig build graph failed:\n${issues.join("\n")}`);
  }

  console.log("tsconfig build graph passed");
}

async function runWorkspaceContractCheck(repoRoot) {
  const workspacePath = join(repoRoot, workspaceContract.path);
  let text;
  try {
    text = await readFile(workspacePath, "utf8");
  } catch (error) {
    throw new Error(`${workspaceContract.path} is not readable: ${error.message}`);
  }

  const issues = validateWorkspaceContract(text);
  if (issues.length > 0) {
    throw new Error(`workspace contract failed:\n${issues.join("\n")}`);
  }

  console.log("workspace contract passed");
}

async function runPackageOwnershipContractCheck(repoRoot) {
  const packageDirs = await listWorkspacePackageDirs(repoRoot);
  const ownershipPath = join(repoRoot, packageOwnershipContract.path);
  let text;
  try {
    text = await readFile(ownershipPath, "utf8");
  } catch (error) {
    throw new Error(`${packageOwnershipContract.path} is not readable: ${error.message}`);
  }

  const issues = validatePackageOwnershipContract(text, packageDirs);
  if (issues.length > 0) {
    throw new Error(`package ownership contract failed:\n${issues.join("\n")}`);
  }

  console.log("package ownership contract passed");
}

async function runCredentialedReleaseEvidenceCheck(repoRoot) {
  const evidencePath = join(repoRoot, credentialedReleaseEvidenceContract.path);
  let text;
  try {
    text = await readFile(evidencePath, "utf8");
  } catch (error) {
    throw new Error(
      `${credentialedReleaseEvidenceContract.path} is not readable: ${error.message}`,
    );
  }

  const issues = validateCredentialedReleaseEvidence(text);
  if (issues.length > 0) {
    throw new Error(`credentialed release evidence record failed:\n${issues.join("\n")}`);
  }

  console.log("credentialed release evidence record passed");
}

async function runWriteModeDogfoodEvidenceCheck(repoRoot) {
  const evidencePath = join(repoRoot, writeModeDogfoodEvidenceContract.path);
  let text;
  try {
    text = await readFile(evidencePath, "utf8");
  } catch (error) {
    throw new Error(`${writeModeDogfoodEvidenceContract.path} is not readable: ${error.message}`);
  }

  const issues = validateWriteModeDogfoodEvidence(text);
  if (issues.length > 0) {
    throw new Error(`write-mode dogfood evidence record failed:\n${issues.join("\n")}`);
  }

  console.log("write-mode dogfood evidence record passed");
}

async function runDryRunDogfoodEvidenceCheck(repoRoot) {
  const evidencePath = join(repoRoot, dryRunDogfoodEvidenceContract.path);
  let text;
  try {
    text = await readFile(evidencePath, "utf8");
  } catch (error) {
    throw new Error(`${dryRunDogfoodEvidenceContract.path} is not readable: ${error.message}`);
  }

  const issues = validateDryRunDogfoodEvidence(text);
  if (issues.length > 0) {
    throw new Error(`dry-run dogfood evidence record failed:\n${issues.join("\n")}`);
  }

  console.log("dry-run dogfood evidence record passed");
}

async function runHostedCiEvidenceCheck(repoRoot) {
  const evidencePath = join(repoRoot, hostedCiEvidenceContract.path);
  let text;
  try {
    text = await readFile(evidencePath, "utf8");
  } catch (error) {
    throw new Error(`${hostedCiEvidenceContract.path} is not readable: ${error.message}`);
  }

  const issues = validateHostedCiEvidence(text);
  if (issues.length > 0) {
    throw new Error(`hosted CI evidence record failed:\n${issues.join("\n")}`);
  }

  console.log("hosted CI evidence record passed");
}

export function validatePackageScriptRegistration(packageJson) {
  const issues = [];
  const scripts = packageJson?.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    return ["package.json scripts must be configured."];
  }

  for (const script of requiredPackageScripts) {
    const value = scripts[script.name];
    if (typeof value !== "string") {
      issues.push(`package.json scripts.${script.name} must be configured.`);
      continue;
    }

    for (const expected of script.includes) {
      if (!value.includes(expected)) {
        issues.push(`package.json scripts.${script.name} must include ${expected}.`);
      }
    }
  }

  const testScript = scripts.test;
  if (typeof testScript !== "string") {
    issues.push("package.json scripts.test must be configured.");
    return issues;
  }

  for (const glob of requiredTestGlobs) {
    if (!testScript.includes(glob)) {
      issues.push(`package.json scripts.test must include ${glob}.`);
    }
  }

  return issues;
}

export function validateRootPackageManager(packageJson, contract = rootPackageManagerContract) {
  const issues = [];

  if (packageJson?.packageManager !== contract.packageManager) {
    issues.push(`${contract.path} packageManager must remain ${contract.packageManager}.`);
  }

  return issues;
}

export function validateFormatterContract(packageJson, config, contract = formatterContract) {
  const issues = [];

  if (packageJson?.devDependencies?.[contract.dependency] !== contract.version) {
    issues.push(
      `package.json devDependencies.${contract.dependency} must remain exactly ${contract.version}.`,
    );
  }

  for (const [name, expected] of Object.entries(contract.config)) {
    if (config?.[name] !== expected) {
      issues.push(`${contract.configPath} ${name} must remain ${JSON.stringify(expected)}.`);
    }
  }

  const ignorePatterns = new Set(
    Array.isArray(config?.ignorePatterns) ? config.ignorePatterns : [],
  );
  for (const pattern of contract.requiredIgnorePatterns) {
    if (!ignorePatterns.has(pattern)) {
      issues.push(`${contract.configPath} ignorePatterns must include ${pattern}.`);
    }
  }

  return issues;
}

export function validateMigrationCompatibilityContract(
  textsByPath,
  manifest,
  contract = migrationCompatibilityContract,
) {
  const issues = [];

  for (const document of contract.documents) {
    const text = textsByPath[document.path];
    for (const snippet of document.requiredSnippets) {
      if (typeof text !== "string" || !text.includes(snippet)) {
        issues.push(`${document.path} must include ${snippet}.`);
      }
    }
  }

  if (manifest?.schemaVersion !== contract.manifestSchemaVersion) {
    issues.push(
      `${contract.manifestPath} schemaVersion must remain ${contract.manifestSchemaVersion}.`,
    );
  }
  if (manifest?.currentSchemaVersion !== contract.currentSchemaVersion) {
    issues.push(
      `${contract.manifestPath} currentSchemaVersion must remain ${contract.currentSchemaVersion}.`,
    );
  }
  if (!manifest?.knownVersions?.includes(contract.currentSchemaVersion)) {
    issues.push(
      `${contract.manifestPath} knownVersions must include ${contract.currentSchemaVersion}.`,
    );
  }
  if (
    manifest?.acceptedFixtures?.[contract.currentSchemaVersion] !== contract.acceptedFixturePath
  ) {
    issues.push(
      `${contract.manifestPath} acceptedFixtures must map ${contract.currentSchemaVersion} to ${contract.acceptedFixturePath}.`,
    );
  }
  if (manifest?.rejectedUnknownVersionFixture !== contract.rejectedFixturePath) {
    issues.push(
      `${contract.manifestPath} rejectedUnknownVersionFixture must remain ${contract.rejectedFixturePath}.`,
    );
  }

  return issues;
}

export function validatePackageReleasePolicy(
  packageJson,
  policy = packageReleasePolicy,
  manifestPath = "package.json",
) {
  const issues = [];

  if (packageJson?.private !== policy.private) {
    issues.push(
      `${manifestPath} private must remain ${String(policy.private)} while public package publication is blocked.`,
    );
  }

  if (packageJson?.version !== policy.version) {
    issues.push(
      `${manifestPath} version must remain ${policy.version} while public package publication is blocked.`,
    );
  }

  return issues;
}

export function validateSmokePackCandidateContract(text, contract = smokePackCandidateContract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateWorkspaceContract(text, contract = workspaceContract) {
  const issues = [];

  if (!text.includes(contract.requiredPackageGlob)) {
    issues.push(
      `${contract.path} must include workspace package glob ${contract.requiredPackageGlob}.`,
    );
  }

  if (!text.includes(contract.requiredBuildAllow)) {
    issues.push(`${contract.path} must explicitly allow the pinned esbuild install script.`);
  }

  return issues;
}

export function validateWorkspacePackageManifest(
  packageJson,
  packageDir,
  manifestPath,
  contract = workspaceContract,
) {
  const issues = [];
  const expectedName = `${contract.packageNameScope}/${packageDir}`;

  if (packageJson?.name !== expectedName) {
    issues.push(`${manifestPath} name must be ${expectedName}.`);
  }

  if (packageJson?.type !== "module") {
    issues.push(`${manifestPath} type must remain module.`);
  }

  return issues;
}

export function validateWorkspacePackageManifestSurface(
  packageJson,
  packageDir,
  manifestPath,
  contract = workspacePackageManifestSurfaceContract,
) {
  const issues = [];

  if (packageJson?.main !== contract.main) {
    issues.push(`${manifestPath} main must remain ${contract.main}.`);
  }

  if (packageJson?.types !== contract.types) {
    issues.push(`${manifestPath} types must remain ${contract.types}.`);
  }

  const exportRoot = packageJson?.exports?.["."];
  if (exportRoot === null || typeof exportRoot !== "object" || Array.isArray(exportRoot)) {
    issues.push(`${manifestPath} exports["."] must define types and default entrypoints.`);
  } else {
    if (exportRoot.types !== contract.types) {
      issues.push(`${manifestPath} exports["."].types must remain ${contract.types}.`);
    }

    if (exportRoot.default !== contract.main) {
      issues.push(`${manifestPath} exports["."].default must remain ${contract.main}.`);
    }
  }

  if (!arraysEqual(packageJson?.files, contract.files)) {
    issues.push(`${manifestPath} files must remain ${JSON.stringify(contract.files)}.`);
  }

  if (packageJson?.license !== contract.license) {
    issues.push(`${manifestPath} license must remain ${contract.license}.`);
  }

  if (!objectsEqual(packageJson?.repository, expectedPackageRepository(packageDir, contract))) {
    issues.push(`${manifestPath} repository metadata must point at packages/${packageDir}.`);
  }

  if (packageJson?.homepage !== contract.homepage) {
    issues.push(`${manifestPath} homepage must remain ${contract.homepage}.`);
  }

  if (!objectsEqual(packageJson?.bugs, contract.bugs)) {
    issues.push(`${manifestPath} bugs metadata must remain ${JSON.stringify(contract.bugs)}.`);
  }

  if (!objectsEqual(packageJson?.engines, contract.engines)) {
    issues.push(`${manifestPath} engines must remain ${JSON.stringify(contract.engines)}.`);
  }

  for (const [scriptName, expectedValue] of Object.entries(contract.scripts)) {
    if (packageJson?.scripts?.[scriptName] !== expectedValue) {
      issues.push(`${manifestPath} scripts.${scriptName} must remain ${expectedValue}.`);
    }
  }

  const expectedBin = contract.binsByPackageDir[packageDir];
  if (expectedBin === undefined) {
    if (packageJson?.bin !== undefined) {
      issues.push(`${manifestPath} must not expose package bin entries.`);
    }
  } else if (!objectsEqual(packageJson?.bin, expectedBin)) {
    issues.push(`${manifestPath} bin must remain ${JSON.stringify(expectedBin)}.`);
  }

  return issues;
}

function expectedPackageRepository(packageDir, contract) {
  return {
    ...contract.repository,
    directory: `packages/${packageDir}`,
  };
}

export function validateWorkspaceInternalDependencies(
  packageJson,
  packageDir,
  manifestPath,
  contract = workspaceInternalDependencyContract,
) {
  const issues = [];
  const allowedDirs = contract.dependenciesByPackageDir[packageDir];
  if (allowedDirs === undefined) {
    issues.push(`${manifestPath} has no internal dependency contract for packages/${packageDir}.`);
    return issues;
  }

  const expectedNames = allowedDirs.map((dir) => `${workspaceContract.packageNameScope}/${dir}`);
  const expectedSet = new Set(expectedNames);
  const runtimeDependencies = dependencyEntries(packageJson?.dependencies);
  const declaredRuntimeInternal = runtimeDependencies.filter(([name]) =>
    name.startsWith(contract.internalScope),
  );
  const declaredRuntimeNames = new Set(declaredRuntimeInternal.map(([name]) => name));

  for (const name of expectedNames) {
    if (!declaredRuntimeNames.has(name)) {
      issues.push(`${manifestPath} dependencies must include ${name}: ${contract.workspaceRange}.`);
    }
  }

  for (const [name, version] of declaredRuntimeInternal) {
    if (!expectedSet.has(name)) {
      issues.push(
        `${manifestPath} dependencies must not include undeclared internal dependency ${name}.`,
      );
      continue;
    }

    if (version !== contract.workspaceRange) {
      issues.push(`${manifestPath} dependency ${name} must use ${contract.workspaceRange}.`);
    }
  }

  for (const sectionName of ["devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name] of dependencyEntries(packageJson?.[sectionName])) {
      if (name.startsWith(contract.internalScope)) {
        issues.push(
          `${manifestPath} ${sectionName} must not declare internal dependency ${name}; use dependencies.`,
        );
      }
    }
  }

  return issues;
}

export function validateTrackedGeneratedOutputPaths(
  paths,
  contract = trackedGeneratedOutputContract,
) {
  const issues = [];

  for (const rawPath of paths) {
    const path = rawPath.replaceAll("\\", "/");

    if (contract.forbiddenPathSuffixes.some((suffix) => path.endsWith(suffix))) {
      issues.push(`tracked generated output must not include ${path}.`);
      continue;
    }

    const boundedPath = `/${path}`;
    if (contract.forbiddenPathFragments.some((fragment) => boundedPath.includes(fragment))) {
      issues.push(`tracked generated output must not include ${path}.`);
    }
  }

  return issues;
}

export function validateRootTsconfigReferences(
  tsconfig,
  packageDirs,
  contract = tsconfigBuildGraphContract,
) {
  const issues = [];
  const referencePaths = tsconfigReferencePaths(tsconfig?.references, contract.path, issues);
  const expectedPaths = packageDirs.map((dir) => `${contract.packageReferencePrefix}${dir}`);
  const expectedSet = new Set(expectedPaths);
  const declaredSet = new Set(referencePaths);

  for (const expected of expectedPaths) {
    if (!declaredSet.has(expected)) {
      issues.push(`${contract.path} references must include ${expected}.`);
    }
  }

  for (const referencePath of referencePaths) {
    if (!expectedSet.has(referencePath)) {
      issues.push(
        `${contract.path} references must not include undeclared project reference ${referencePath}.`,
      );
    }
  }

  return issues;
}

export function validateWorkspacePackageTsconfigReferences(
  tsconfig,
  packageDir,
  tsconfigPath,
  contract = workspaceInternalDependencyContract,
) {
  const issues = [];
  const allowedDirs = contract.dependenciesByPackageDir[packageDir];
  if (allowedDirs === undefined) {
    issues.push(`${tsconfigPath} has no internal dependency contract for packages/${packageDir}.`);
    return issues;
  }

  if (tsconfig?.compilerOptions?.composite !== true) {
    issues.push(
      `${tsconfigPath} compilerOptions.composite must remain true for TypeScript project references.`,
    );
  }

  const referencePaths = tsconfigReferencePaths(tsconfig?.references, tsconfigPath, issues);
  const expectedPaths = allowedDirs.map((dir) => `../${dir}`);
  const expectedSet = new Set(expectedPaths);
  const declaredSet = new Set(referencePaths);

  for (const expected of expectedPaths) {
    if (!declaredSet.has(expected)) {
      issues.push(`${tsconfigPath} references must include ${expected}.`);
    }
  }

  for (const referencePath of referencePaths) {
    if (!expectedSet.has(referencePath)) {
      issues.push(
        `${tsconfigPath} references must not include undeclared project reference ${referencePath}.`,
      );
    }
  }

  return issues;
}

export function validatePackageOwnershipContract(
  text,
  packageDirs,
  contract = packageOwnershipContract,
) {
  const issues = [];
  const tableEntries = extractPackageOwnershipEntries(text);
  const documentedPackages = new Set(tableEntries.map((entry) => entry.packagePath));
  const workspacePackages = new Set(packageDirs.map((dir) => `packages/${dir}`));

  for (const packagePath of workspacePackages) {
    if (!documentedPackages.has(packagePath)) {
      issues.push(`${contract.path} missing Package Table entry for ${packagePath}.`);
    }
  }

  for (const entry of tableEntries) {
    if (!workspacePackages.has(entry.packagePath)) {
      issues.push(`${contract.path} references missing workspace package ${entry.packagePath}.`);
    }

    if (entry.status !== "Implemented") {
      issues.push(
        `${contract.path} Package Table entry for ${entry.packagePath} must have status Implemented.`,
      );
    }
  }

  for (const adrPath of contract.requiredAdrReferences) {
    if (!text.includes(adrPath)) {
      issues.push(`${contract.path} must include related ADR ${adrPath}.`);
    }
  }

  return issues;
}

export function validateCredentialedReleaseEvidence(
  text,
  contract = credentialedReleaseEvidenceContract,
) {
  return validateReleaseEvidenceText(text, contract);
}

export function validateWriteModeDogfoodEvidence(
  text,
  contract = writeModeDogfoodEvidenceContract,
) {
  return validateReleaseEvidenceText(text, contract);
}

export function validateDryRunDogfoodEvidence(text, contract = dryRunDogfoodEvidenceContract) {
  return validateReleaseEvidenceText(text, contract);
}

export function validateHostedCiEvidence(text, contract = hostedCiEvidenceContract) {
  return validateReleaseEvidenceText(text, contract);
}

function validateReleaseEvidenceText(text, contract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  for (const requirement of contract.requiredPatterns) {
    if (!requirement.pattern.test(text)) {
      issues.push(`${contract.path} must include ${requirement.description}.`);
    }
  }

  return issues;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPackageOwnershipEntries(text) {
  const entries = [];
  const lines = extractMarkdownSection(text, "Package Table").split(/\r?\n/);
  const pattern = /^\|\s*`(?<packagePath>packages\/[^`]+)`\s*\|\s*(?<status>[^|]+?)\s*\|/;

  for (const line of lines) {
    const match = pattern.exec(line);
    if (match?.groups === undefined) {
      continue;
    }

    entries.push({
      packagePath: match.groups.packagePath.trim(),
      status: match.groups.status.trim(),
    });
  }

  return entries;
}

function extractMarkdownSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (headingPattern.test(lines[index])) {
      start = index + 1;
      break;
    }
  }

  if (start === -1) {
    return "";
  }

  const sectionLines = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      break;
    }

    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n");
}

function dependencyEntries(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value);
}

function arraysEqual(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }

  return actual.every((value, index) => value === expected[index]);
}

function objectsEqual(actual, expected) {
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }

  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  if (actualEntries.length !== expectedEntries.length) {
    return false;
  }

  return expectedEntries.every(([key, value]) => actual[key] === value);
}

function tsconfigReferencePaths(value, path, issues) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`${path} references must be an array when present.`);
    return [];
  }

  const paths = [];
  for (const reference of value) {
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
      issues.push(`${path} references entries must be objects with a path string.`);
      continue;
    }

    if (typeof reference.path !== "string" || reference.path.length === 0) {
      issues.push(`${path} references entries must include a non-empty path string.`);
      continue;
    }

    paths.push(reference.path);
  }

  return paths;
}

function findRequiredYamlMappingBlock(text, path, key, issues) {
  const block = findYamlMappingBlock(text, key);
  if (block === undefined) {
    issues.push(`${path} must define ${key}.`);
  }

  return block;
}

function findYamlMappingBlock(text, key) {
  const lines = Array.isArray(text) ? text : text.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*$`);

  for (let index = 0; index < lines.length; index += 1) {
    const match = keyPattern.exec(lines[index]);
    if (match === null) {
      continue;
    }

    const indent = match[1].length;
    const block = [lines[index]];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim().length > 0 && leadingSpaceCount(line) <= indent) {
        break;
      }

      block.push(line);
    }

    return block;
  }

  return undefined;
}

function findYamlScalarValue(block, key) {
  const pattern = new RegExp(`^\\s+${escapeRegExp(key)}:\\s*(.*?)\\s*$`);
  for (const line of block) {
    const match = pattern.exec(line);
    if (match !== null) {
      return match[1];
    }
  }

  return undefined;
}

function leadingSpaceCount(value) {
  const match = /^ */.exec(value);
  return match === null ? 0 : match[0].length;
}

function validateSnippetOrder(text, path, snippets) {
  const issues = [];
  let cursor = -1;

  for (const snippet of snippets) {
    const next = text.indexOf(snippet);
    if (next === -1) {
      continue;
    }

    if (next <= cursor) {
      issues.push(`${path} must keep ${snippet} after the previous release-check step.`);
      continue;
    }

    cursor = next;
  }

  return issues;
}

function shouldSkipSecretScanPath(repoPath) {
  return (
    repoPath === ".git" ||
    repoPath.startsWith(".git/") ||
    repoPath === "node_modules" ||
    repoPath.includes("/node_modules/") ||
    repoPath.includes("/dist/") ||
    repoPath.endsWith(".tsbuildinfo")
  );
}

async function listFiles(dir, predicate, repoRoot) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipTraversalPath(repoRoot, entryPath)) {
        continue;
      }

      files.push(...(await listFiles(entryPath, predicate, repoRoot)));
      continue;
    }

    if (entry.isFile() && predicate(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function listWorkspacePackageManifests(repoRoot) {
  return listFiles(join(repoRoot, "packages"), (name) => name === "package.json", repoRoot);
}

async function listWorkspacePackageDirs(repoRoot) {
  const manifests = await listWorkspacePackageManifests(repoRoot);
  return manifests
    .map((manifestPath) => workspaceDirFromManifestPath(repoRoot, manifestPath))
    .sort();
}

function workspaceDirFromManifestPath(repoRoot, manifestPath) {
  return relative(join(repoRoot, "packages"), dirname(manifestPath)).replaceAll(sep, "/");
}

function shouldSkipTraversalPath(repoRoot, path) {
  return shouldSkipSecretScanPath(toRepoPath(repoRoot, path));
}

function toRepoPath(repoRoot, path) {
  return relative(repoRoot, path).replaceAll(sep, "/");
}
