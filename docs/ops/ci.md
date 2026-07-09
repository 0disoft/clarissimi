# CI

- Status: Draft

## Operational Contract

Cover required checks, branch protection, pipeline stages, artifacts, failure policy, local parity, and stop conditions.

The current local CI parity commands are:

- `pnpm run docs`: verifies required documentation targets and local Markdown links.
- `pnpm run smoke`: builds the workspace, runs the CLI through real subprocesses, runs the Action
  dry-run fixture path, and verifies default `propose` mode fails closed without `GITHUB_TOKEN`.
- `pnpm run live-provider-smoke`: builds the workspace and runs the CLI against the explicit
  OpenAI-compatible provider using maintainer-provided `CLARISSIMI_PROVIDER_TOKEN` and
  `CLARISSIMI_PROVIDER_MODEL`. It also accepts optional `CLARISSIMI_PROVIDER_ENDPOINT` and
  `CLARISSIMI_PROVIDER_THINKING`. This command is a release smoke, not a correctness check.
- `pnpm run check`: runs typecheck and the package test suite.
- `pnpm run contract`: runs typecheck and tests as the current contract gate.

`format`, `lint`, and `migration-check` remain intentionally unconfigured and fail until their
owners define real checks.

The hosted CI workflow `.github/workflows/ci.yml` runs on `push` to `main`, `pull_request`, and
manual dispatch. It uses read-only repository permissions and runs `docs`, `smoke`, `check`, and
`contract` with Node.js 24 and the package-manager version declared by `package.json`.

The live provider smoke workflow `.github/workflows/clarissimi-live-provider-smoke.yml` is
manual-only. It reads `CLARISSIMI_PROVIDER_TOKEN` from repository secrets,
a required dispatch-time `provider-model` input, and an optional dispatch-time `provider-endpoint`
input before running `pnpm run live-provider-smoke`. The optional dispatch-time
`provider-thinking` input maps to `CLARISSIMI_PROVIDER_THINKING` for providers that need thinking
disabled to return parseable JSON.

Local credentialed live-provider smoke passed on `2026-07-09` using maintainer-owned OpenAI
credentials mapped in-process to `CLARISSIMI_PROVIDER_TOKEN` and `CLARISSIMI_PROVIDER_MODEL` set to
`gpt-4.1-mini`. No provider token value was written to repository files.

Local OpenCode Go live-provider smoke passed on `2026-07-09` using maintainer-owned credentials,
`CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode Go chat completions endpoint, and
`CLARISSIMI_PROVIDER_THINKING=disabled`.

Local UMANS live-provider smoke passed on `2026-07-09` using maintainer-owned credentials,
`CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`, and the UMANS OpenAI-compatible chat completions
endpoint.

Repository Actions settings keep default workflow permissions at read-only, with workflow-created
pull requests enabled so explicit `propose` jobs can open recognition proposal pull requests.

The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`
to pass with strict up-to-date status checks. Administrator enforcement is disabled so repository
owners can recover from CI or protection misconfiguration without changing the branch rule first.

## Owners

- Primary owner: UNASSIGNED
- Backup owner: UNASSIGNED
- Escalation path: UNDECIDED

## Validation

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Remaining operational risk: hosted manual live-provider smoke workflow evidence with repository
  secret configuration is not complete.
