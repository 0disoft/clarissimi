# Release

- Status: Draft

## Operational Contract

Cover release types, versioning, pre-release checklist, deployment flow, post-deploy verification, stop conditions, and owner handoff.

## Current Release Policy

Clarissimi is not ready for public package publication. The repository may continue to merge and
dogfood source changes on `main`, but npm package publication, marketplace release notes, or a
versioned Action tag must wait until the pre-release gates below are satisfied.

The current root package stays private at `0.0.0`. Do not bump versions, publish packages, or create
release tags as part of ordinary implementation work until maintainers accept a release ADR or
update this operational contract.

## Release Types

- Source-only merge: allowed after `pnpm run check`, `pnpm run contract`, and repository hygiene
  checks pass.
- Dogfood workflow update: allowed when Action examples, permissions, `actionlint`, and root
  `action.yml` parsing pass.
- Public package publication: blocked.
- Versioned GitHub Action tag: blocked.

## Pre-Release Gates

Public package publication and versioned Action tags require:

- live provider adapter credential handling is implemented and documented without fake secrets
- CLI and Action provider selection for live providers is implemented without making live calls part
  of correctness tests
- `.github/workflows/clarissimi-propose-fixture.yml` or an equivalent public repository scenario
  passes
- hosted CI workflow `.github/workflows/ci.yml` passes on the release candidate commit
- `pnpm run check`
- `pnpm run contract`
- `pnpm run smoke`
- `pnpm run live-provider-smoke` with maintainer-owned live provider credentials
- `.github/workflows/clarissimi-live-provider-smoke.yml` passes when using maintainer-owned
  repository secret configuration and a dispatch-time provider model
- `pnpm run docs`
- `ssealed doctor . --json`
- `actionlint` for workflow examples
- root `action.yml` parses with `yq`
- secret scan shows no committed provider tokens, GitHub tokens, private keys, or environment files
- rollback instructions cover closing proposal pull requests and deleting proposal branches

## Owners

- Primary owner: UNASSIGNED
- Backup owner: UNASSIGNED
- Escalation path: UNDECIDED

## Validation

- Required validation names: `check`, `contract`, `smoke`, `docs`
- Release blocker status: public package publication and versioned Action tags are blocked
- Current dogfood evidence: `Clarissimi propose fixture` workflow run
  `28984721611` passed on `2026-07-09T00:14:30Z` and created proposal pull request
  `https://github.com/0disoft/clarissimi/pull/1`.
- Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
- Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode
  Go chat completions endpoint, and `CLARISSIMI_PROVIDER_THINKING=disabled`.
- Remaining operational risk: hosted manual live-provider smoke workflow evidence with repository
  secret configuration is not complete.
