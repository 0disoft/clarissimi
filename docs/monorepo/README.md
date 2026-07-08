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
- Monorepo validation evidence: `pnpm run typecheck`, `pnpm run test`, `pnpm run contract`, and
  `pnpm run check` cover implemented packages.
- Monorepo release or rollout policy: UNDECIDED.
- Monorepo compatibility and migration policy: schema changes must preserve or explicitly migrate
  accepted schema versions.

## Current Packages

- `packages/schemas`: TypeScript schema vocabulary, assessment draft types, and runtime validation.
- `packages/core`: Pure policy glue for prepared provider evidence and public approval gates.
- `packages/redaction`: Deterministic redaction for text and JSON-like evidence values before
  provider boundaries.

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- A package duplicates contribution type, impact level, approval status, or evidence kind values
  instead of importing them from `packages/schemas`.
