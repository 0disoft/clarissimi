# Workspace Boundaries

- Status: Draft
- Repository Type: monorepo

## Repository Type Contract

This repository type owns workspace boundaries, package ownership, dependency policy, and change coordination.

## Source of Truth

- Product decision: `docs/product/02-spec.md`
- Technical owner: Repository maintainers
- Related ADRs: `docs/adr/0009-start-schema-package-implementation.md`,
  `docs/adr/0010-add-redaction-package-boundary.md`,
  `docs/adr/0011-add-core-policy-package.md`,
  `docs/adr/0012-add-fake-provider-package.md`,
  `docs/adr/0013-add-renderers-package.md`,
  `docs/adr/0014-add-fixture-first-cli-package.md`,
  `docs/adr/0015-add-fixture-first-github-collector.md`,
  `docs/adr/0016-add-dry-run-action-skeleton.md`,
  `docs/adr/0017-propose-mode-write-boundary.md`,
  `docs/adr/0018-add-live-github-collector-boundary.md`,
  `docs/adr/0019-add-openai-compatible-provider-adapter.md`,
  `docs/adr/0020-add-agent-assisted-draft-import.md`,
  `docs/adr/0021-add-draft-inbox-staging.md`,
  `docs/adr/0023-add-action-draft-inbox-proposal-mode.md`,
  `docs/adr/0024-add-draft-approval-helper.md`,
  `docs/adr/0025-centralize-config-schema-validation.md`

## Required Decisions

- Monorepo ownership boundary: each package owns one narrow runtime boundary and must not absorb
  domain policy from another package.
- Monorepo public contract: package exports are allowed only when named by product docs, ADRs, or
  package ownership docs.
- Monorepo validation evidence: implemented packages are covered by `pnpm run docs`,
  `pnpm run release-readiness`, `pnpm run lint`, `pnpm run smoke`, `pnpm run check`, and
  `pnpm run contract`.
- Monorepo release or rollout policy: no public package publication or versioned Action tag before
  `docs/ops/release.md` gates pass.
- Monorepo compatibility and migration policy: schema versions and ledger shape changes require an
  ADR or product decision plus validation and rollback guidance.

## Boundary Rules

- `packages/schemas` owns vocabulary, config value validation, and assessment validation.
- `packages/core` owns policy glue but not I/O.
- `packages/redaction` owns masking and redaction reports.
- `packages/github` owns GitHub evidence collection but not tokens, redaction, providers, or
  repository writes.
- `packages/providers` owns provider adapters but not environment loading or approval policy.
- `packages/renderers` owns deterministic output rendering but not filesystem writes.
- `packages/cli` owns local command orchestration and config file loading.
- `packages/action` owns GitHub Action runtime orchestration and proposal boundaries.

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- A package duplicates schema vocabulary instead of importing from `packages/schemas`.
- A package begins owning secrets, provider calls, GitHub writes, or approval policy outside its
  documented boundary.
