# CI

- Status: Draft

## Operational Contract

Cover required checks, branch protection, pipeline stages, artifacts, failure policy, local parity, and stop conditions.

The current local CI parity commands are:

- `pnpm run docs`: verifies required documentation targets, local Markdown links, fenced JSON
  examples, and ADR index coverage for accepted ADR files.
- `pnpm run smoke`: builds the workspace, runs the CLI through real subprocesses, runs the Action
  dry-run fixture path, verifies default `propose` mode fails closed without `GITHUB_TOKEN`, and
  verifies the live-provider smoke preflight stops before provider calls when credentials are
  missing. It also runs `pnpm pack --dry-run --json` for each workspace package after build and
  verifies the package candidate contains only public package files such as `dist`, `README.md`,
  `LICENSE`, and `package.json`.
- `pnpm run live-provider-smoke`: builds the workspace and runs the CLI against the explicit
  OpenAI-compatible provider using maintainer-provided `CLARISSIMI_PROVIDER_TOKEN` and
  `CLARISSIMI_PROVIDER_MODEL`. It also accepts optional `CLARISSIMI_PROVIDER_ENDPOINT` and
  `CLARISSIMI_PROVIDER_THINKING`, and validates those optional inputs before provider calls. This
  command is a release smoke, not a correctness check.
- `pnpm run hosted-ci-validation`: checks the hosted GitHub Actions `CI` workflow result for the
  selected commit. The helper uses `gh run list` to find the `CI` workflow run and `gh run watch`
  when the run is still queued or in progress. It defaults to the current HEAD on
  `0disoft/clarissimi@main`, validates repository, ref, workflow, and SHA inputs before GitHub API
  calls, and does not read repository secrets. This command is a release candidate verification
  helper, not a replacement for local checks.
- `pnpm run release-readiness`: runs non-credentialed release checks for documentation,
  release-critical package script registration, package and script test-glob registration, the
  workspace package glob, workspace package manifest identity, the blocked root and workspace
  package publication policy, Action release policy document status, public product-positioning
  guardrails, workspace package publish surface, package ownership table coverage, package
  publication metadata, internal workspace dependency graph, TypeScript project-reference build
  graph, recorded dry-run and write-mode dogfood evidence, the repository-wide `format` gate and
  manifest-backed `migration-check`, release tool availability, CI runtime and release-tool pin
  drift, `ssealed doctor`, workflow `actionlint`, YAML parsing, `git diff --check`, tracked
  generated-output drift, high-risk secret patterns, and hosted CI validation wrapper registration.
  The sole generated release-artifact exception is `action-dist/index.js`; release readiness
  rebuilds it in memory and requires byte-for-byte freshness through `bundle:action:check`.
  It also verifies that rollback instructions still cover staging cleanup, proposal pull request
  closure, proposal branch deletion, post-merge reverts, and the no-database MVP policy; that
  `smoke` keeps workspace package pack dry-run coverage; that the root Action manifest keeps the
  expected inputs, outputs, defaults, secret environment boundary, and runtime commands; that
  workflow files declare explicit `permissions` blocks without `pull_request_target` or
  `write-all`; and that the hosted CI workflow still runs the required local parity commands with
  read-only contents permission.
  Fixture dogfood workflow contracts are also checked so dry-run stays read-only, exercises the
  sanitized JSON summary artifact path, and propose and stage-draft stay manual, fixture-backed,
  and output-asserting. Approved-draft promotion also stays manual, fixture-backed, and
  output-asserting. It is a maintainer release gate, not a live-provider check. The hosted live
  provider workflow contract is checked for manual-only dispatch, read-only permissions, input and
  secret preflight before checkout, runtime setup, and the release smoke command.
- `pnpm run lint`: runs `oxlint` across the repository as a fast JavaScript and TypeScript lint
  gate.
- `pnpm run format`: runs Oxfmt in check mode across maintained TypeScript, JavaScript, JSON,
  Markdown, and YAML files. Generated Action bundles and build/cache output are ignored.
- `pnpm run migration-check`: builds the schema package, validates the persisted-schema migration
  manifest and accepted compatibility fixtures, executes every repository-local adjacent-version
  migration twice to prove deterministic output, validates the final current-schema value, and
  verifies unknown assessment versions fail closed.
- `pnpm run benchmark:scale`: builds the workspace, runs deterministic 1,000- and 10,000-record
  ledger rebuild, redaction, and Markdown workloads, validates output counts and digests, and
  enforces generous catastrophic-regression ceilings. Wall-clock results remain runner-specific
  samples rather than product latency promises.
- `pnpm run benchmark:scale:sample`: runs the same deterministic workloads three times and emits a
  local JSON report for investigation; it is not a merge gate.
- `pnpm run check`: runs typecheck and the package test suite.
- `pnpm run contract`: runs typecheck and tests as the current contract gate.

ADR 0036 accepts the corrected Oxfmt baseline and `release-readiness` protects its package,
configuration, ignore, and CI contracts. ADR 0037 accepts the manifest-backed migration
compatibility gate and `release-readiness` protects its script, fixtures, tests, and CI contract.

`pnpm run bundle:action` compiles the workspace and writes the reviewable Action runtime bundle.
`pnpm run bundle:action:check` compiles the same graph without rewriting the tracked artifact and
fails when `action-dist/index.js` is missing or stale. Consumer workflows do not invoke pnpm or the
TypeScript compiler. Source lint excludes the derived bundle; bundle freshness and bundled Action
smoke cover that artifact instead.

The hosted CI workflow `.github/workflows/ci.yml` runs on `push` to `main`, `pull_request`, and
manual dispatch. It uses read-only repository permissions and runs `docs`, `release-readiness`,
`lint`, `format`, `migration-check`, `benchmark:scale`, `smoke`, `check`, and `contract` with
Node.js 24 and the package-manager version declared by `package.json`.

Before public package publication or a versioned Action tag, release maintainers should run:

```powershell
pnpm run hosted-ci-validation
```

Use `--sha`, `--branch`, or `--repo` only when validating a release candidate that is not the
current local `HEAD` on `main`.

Hosted CI installs pinned non-credentialed release tooling before `release-readiness`:

- `ssealed@0.6.8` from npm
- `rhysd/actionlint@1.7.12` from the GitHub release `linux_amd64` asset with sha256 verification
- `mikefarah/yq@4.53.3` from the GitHub release `linux_amd64` asset with sha256 verification

The live provider smoke workflow `.github/workflows/clarissimi-live-provider-smoke.yml` is
manual-only. It reads `CLARISSIMI_PROVIDER_TOKEN` from repository secrets,
a required dispatch-time `provider-model` input, and an optional dispatch-time `provider-endpoint`
input before running `pnpm run live-provider-smoke`. The optional dispatch-time
`provider-thinking` input maps to `CLARISSIMI_PROVIDER_THINKING` for providers that need thinking
disabled to return parseable JSON. The workflow checks dispatch inputs and repository secret
configuration before checkout, dependency installation, or build work begins.

Local credentialed live-provider smoke passed on `2026-07-09` using maintainer-owned OpenAI
credentials mapped in-process to `CLARISSIMI_PROVIDER_TOKEN` and `CLARISSIMI_PROVIDER_MODEL` set to
`gpt-4.1-mini`. No provider token value was written to repository files.

Local OpenCode Go live-provider smoke passed on `2026-07-09` using maintainer-owned credentials,
`CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode Go chat completions endpoint, and
`CLARISSIMI_PROVIDER_THINKING=disabled`.

Local UMANS live-provider smoke passed on `2026-07-09` using maintainer-owned credentials,
`CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`, and the UMANS OpenAI-compatible chat completions
endpoint.

Hosted live-provider smoke evidence is recorded in `docs/ops/release.md` with the workflow run
URL, timestamp, validated source commit, repository secret name, and provider model. Refresh it
with `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
release-candidate commit before public package publication or a versioned Action tag.

Repository Actions settings keep default workflow permissions at read-only, with workflow-created
pull requests enabled so explicit `propose`, `stage-draft`, and `promote-draft` jobs can open proposal pull requests.
Write-mode dogfood remains manual-only through `.github/workflows/clarissimi-propose-fixture.yml`
and `.github/workflows/clarissimi-stage-draft-fixture.yml`. Approved-draft promotion dogfood is
manual-only through `.github/workflows/clarissimi-promote-draft-fixture.yml`.

Hosted read-only dogfood evidence:

- `Clarissimi dry run` run `29031384775` passed on `2026-07-09T15:54:58Z` from `main` at
  `77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb` and exercised the sanitized JSON summary artifact
  validation path.

Hosted write-mode dogfood evidence:

- `Clarissimi propose fixture` run `29027800039` passed on `2026-07-09T15:02:15Z` and updated
  `https://github.com/0disoft/clarissimi/pull/1`.
- `Clarissimi stage draft fixture` run `29027802451` passed on `2026-07-09T15:02:10Z` and updated
  `https://github.com/0disoft/clarissimi/pull/2`.

The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`
to pass with strict up-to-date status checks. Administrator enforcement is disabled so repository
owners can recover from CI or protection misconfiguration without changing the branch rule first.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`
- Release status: versioned Action tags are allowed by ADR 0031 after release gates pass; public
  package publication remains blocked by `docs/ops/release.md`.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
