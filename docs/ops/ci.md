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
- `pnpm run release-readiness`: runs non-credentialed release checks for documentation,
  release-critical package script registration, package and script test-glob registration, the
  workspace package glob, workspace package manifest identity, the blocked root and workspace
  package release policy, workspace package publish surface, package ownership table coverage,
  package publication metadata, internal workspace dependency graph, TypeScript project-reference
  build graph, recorded dry-run and write-mode dogfood evidence, the intentionally fail-closed
  `format` placeholder, release tool
  availability, CI runtime and release-tool pin drift, `ssealed doctor`, workflow `actionlint`,
  YAML parsing, `git diff --check`, tracked generated-output drift, and high-risk secret patterns.
  It also verifies that rollback instructions still cover staging cleanup, proposal pull request
  closure, proposal branch deletion, post-merge reverts, and the no-database MVP policy; that
  `smoke` keeps workspace package pack dry-run coverage; that the root Action manifest keeps the
  expected inputs, outputs, defaults, secret environment boundary, and runtime commands; that
  workflow files declare explicit `permissions` blocks without `pull_request_target` or
  `write-all`; and that the hosted CI workflow still runs the required local parity commands with
  read-only contents permission.
  Fixture dogfood workflow contracts are also checked so dry-run stays read-only, exercises the
  sanitized JSON summary artifact path, and propose and stage-draft stay manual, fixture-backed,
  and output-asserting. It is a maintainer release gate, not a live-provider check. The hosted live
  provider workflow contract is checked for manual-only dispatch, read-only permissions, input and
  secret preflight before checkout, runtime setup, and the release smoke command.
- `pnpm run lint`: runs `oxlint` across the repository as a fast JavaScript and TypeScript lint
  gate.
- `pnpm run check`: runs typecheck and the package test suite.
- `pnpm run contract`: runs typecheck and tests as the current contract gate.

`format` remains intentionally unconfigured, fails closed, and is protected by
`release-readiness` until a formatter baseline ADR accepts the rewrite. `migration-check` remains
intentionally unconfigured and fails until its owner defines a real check.

The hosted CI workflow `.github/workflows/ci.yml` runs on `push` to `main`, `pull_request`, and
manual dispatch. It uses read-only repository permissions and runs `docs`, `release-readiness`,
`lint`, `smoke`, `check`, and `contract` with Node.js 24 and the package-manager version declared
by `package.json`.

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

Hosted live-provider smoke passed on `2026-07-09T12:39:17Z` as workflow run `29018826925` from
`main` at `799119fd146bb6e62bf0413caf0773559aee63ee` using repository secret
`CLARISSIMI_PROVIDER_TOKEN` and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.

Repository Actions settings keep default workflow permissions at read-only, with workflow-created
pull requests enabled so explicit `propose` and `stage-draft` jobs can open proposal pull requests.
Write-mode dogfood remains manual-only through `.github/workflows/clarissimi-propose-fixture.yml`
and `.github/workflows/clarissimi-stage-draft-fixture.yml`.

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

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Current hosted live-provider evidence: workflow run `29018826925` passed on
  `2026-07-09T12:39:17Z` using repository secret `CLARISSIMI_PROVIDER_TOKEN`.
