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
  `CLARISSIMI_PROVIDER_MODEL`, and optional `CLARISSIMI_PROVIDER_ENDPOINT`.

## Owners

- Primary owner: UNASSIGNED
- Backup owner: UNASSIGNED
- Escalation path: UNDECIDED

## Validation

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Remaining operational risk: credentialed live-provider smoke run evidence is not complete.
