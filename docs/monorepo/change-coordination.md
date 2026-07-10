# Change Coordination

- Status: Draft
- Repository Type: monorepo

## Repository Type Contract

This repository type owns workspace boundaries, package ownership, dependency policy, and change coordination.

## Source of Truth

- Product decision: `docs/product/02-spec.md`
- Technical owner: Repository maintainers
- Related ADRs: `docs/adr/`, `docs/monorepo/package-ownership.md`,
  `docs/engineering/02-code-review-checklist.md`

## Required Decisions

- Monorepo ownership boundary: cross-package work must name the packages whose contracts change.
- Monorepo public contract: exported types, functions, CLI commands, Action inputs, and output
  files require matching documentation changes.
- Monorepo validation evidence: use the narrowest relevant targeted tests first, then `docs`,
  `release-readiness`, `lint`, `smoke`, `check`, and `contract` before merge.
- Monorepo release or rollout policy: source-only merges may land after local and hosted
  validation, and ADR 0031 allows the root Action tag after release gates pass; package publication
  remains blocked by `docs/ops/release.md`.
- Monorepo compatibility and migration policy: public data, config, ledger, and Action contract
  changes require compatibility notes or explicit migration decisions.

## Coordination Rules

- Schema vocabulary changes must update `packages/schemas`, dependent package tests, product docs,
  and renderer or CLI/Action contracts as needed.
- Provider changes must keep correctness tests on fake fetches or deterministic providers.
- GitHub Action write-mode changes must include Action tests, permission review, rollback language,
  and workflow validation when workflows change.
- Renderer and ledger changes must prove rebuild determinism, duplicate handling, and no-public-score
  guarantees.
- CLI command changes must update help text, command contract docs, JSON output expectations, and
  tests.
- Generated `dist/`, cache, and dependency directories are not source truth and must not be edited
  as implementation evidence.

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- A change silently changes public output shape, Action output names, CLI exit codes, or config
  precedence.
- A change relies on local generated output rather than source and tests.
