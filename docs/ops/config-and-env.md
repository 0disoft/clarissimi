# Config and Environment

- Status: Draft

## Operational Contract

Treat configuration as a runtime contract with defaults, environment ownership, validation, reload policy, and drift handling.

The provider package accepts explicit adapter options but does not read environment variables.
Regular configuration may contain provider id, endpoint, model, output mode, thresholds, and
renderer targets. Secret values such as provider tokens and GitHub tokens must stay outside config
files and be passed by the CLI, GitHub Action, local shell, or secret store boundary that owns them.

Current implementation status:

- `packages/providers` includes a fake deterministic provider and an SDK-free OpenAI-compatible
  HTTP adapter.
- CLI and Action provider selection default to the fake provider and support explicit
  `openai-compatible` selection when a model and `CLARISSIMI_PROVIDER_TOKEN` are provided.
- `pnpm run live-provider-smoke` uses `CLARISSIMI_PROVIDER_TOKEN`,
  `CLARISSIMI_PROVIDER_MODEL`, optional `CLARISSIMI_PROVIDER_ENDPOINT`, and optional
  `CLARISSIMI_PROVIDER_THINKING`.
- `pnpm run provider-model-eval` reads only the token environment variable names declared by an
  explicit local matrix. Its `--check` mode reads no token values and performs no network calls;
  live mode is manual-only and documented in `docs/ops/provider-model-eval.md`.
- Local credentialed live-provider smoke passed on `2026-07-09` with
  `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini` and a maintainer-owned provider token supplied only
  through the process environment.
- Local OpenCode Go live-provider smoke passed on `2026-07-09` with
  `CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode Go chat completions endpoint, and
  `CLARISSIMI_PROVIDER_THINKING=disabled`.
- Local UMANS live-provider smoke passed on `2026-07-09` with
  `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2` and the UMANS OpenAI-compatible chat completions
  endpoint.

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
