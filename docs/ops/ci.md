# CI

- Status: Draft

## Operational Contract

Cover required checks, branch protection, pipeline stages, artifacts, failure policy, local parity, and stop conditions.

The current local CI parity commands are:

- `pnpm run docs`: verifies required documentation targets and local Markdown links.
- `pnpm run smoke`: builds the workspace, runs the CLI through real subprocesses, runs the Action
  dry-run fixture path, and verifies default `propose` mode fails closed without `GITHUB_TOKEN`.
- `pnpm run check`: runs typecheck and the package test suite.
- `pnpm run contract`: runs typecheck and tests as the current contract gate.

`format`, `lint`, and `migration-check` remain intentionally unconfigured and fail until their
owners define real checks.

## Owners

- Primary owner: UNASSIGNED
- Backup owner: UNASSIGNED
- Escalation path: UNDECIDED

## Validation

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Remaining operational risk: branch protection, hosted CI enforcement, and live-provider smoke
  coverage are not complete.
