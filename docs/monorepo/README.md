# Monorepo

- Status: Draft
- Repository Type: monorepo

## Repository Type Contract

This repository type owns workspace boundaries, package ownership, dependency policy, and change coordination.

## Source of Truth

- Product decision: docs/product/02-spec.md
- Technical owner: Repository maintainers
- Related ADR: docs/adr/0009-start-schema-package-implementation.md

## Required Decisions

- Monorepo ownership boundary: packages own narrow product boundaries and must not redefine
  shared schema vocabulary.
- Monorepo public contract: package public exports must be documented by package ownership and
  ADRs before other packages depend on them.
- Monorepo validation evidence: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, and `pnpm run contract` cover implemented packages before
  source-only merges.
- Monorepo release or rollout policy: root and workspace packages remain private. The bundled
  standalone CLI is the only npm distribution and follows the separate ADR 0056 gates in
  `docs/ops/release.md`.
- Monorepo compatibility and migration policy: schema changes must preserve or explicitly migrate
  accepted schema versions.

## Current Packages

- `packages/schemas`: TypeScript schema vocabulary, config types, assessment draft types, and
  runtime validation.
- `packages/core`: Pure policy glue for prepared provider evidence and public approval gates.
- `packages/redaction`: Deterministic redaction for text and JSON-like evidence values before
  provider boundaries.
- `packages/github`: Fixture-first and injected-client live GitHub merged pull request evidence
  collection.
- `packages/providers`: Provider adapter interface, deterministic fake contribution draft
  provider, and SDK-free OpenAI-compatible HTTP adapter.
- `packages/renderers`: Deterministic JSONL, contributor JSON, Markdown, static-data output, and
  draft review rendering.
- `packages/cli`: Fixture-first local command orchestration for config file loading, ledger
  validation, recognition dry runs, agent-assisted draft staging/approval/import, and rebuild
  previews.
- `packages/action`: GitHub Action entrypoint for dry-run summaries, fixture-first proposal pull
  requests, draft review proposals, and event-path live GitHub collection in write modes.

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- A package duplicates contribution type, impact level, approval status, or evidence kind values
  instead of importing them from `packages/schemas`.
