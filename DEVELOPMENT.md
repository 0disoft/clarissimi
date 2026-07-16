# Development

- Status: Draft
- Owner: Repository maintainers

## Purpose

Development preserves Clarissimi's accepted product, architecture, package, validation, and release
contracts while extending the TypeScript monorepo, local CLI, and GitHub Action.

## Source of Truth

- Product contract: `docs/product/02-spec.md`
- Architecture contract: `ARCHITECTURE.md` and `docs/architecture/*.md`
- Package ownership: `docs/monorepo/package-ownership.md`
- Accepted decisions: `docs/adr/README.md`
- Technical owner: Repository maintainers

## Required Decisions

- Boundary: packages own only the responsibilities assigned by
  `docs/monorepo/package-ownership.md`; the CLI and Action orchestrate but do not own domain policy.
- Data ownership: `packages/schemas` owns shared vocabulary, and
  `.clarissimi/contributions.jsonl` owns approved recognition history. Contributor JSON, Markdown,
  and static data are rebuildable derived views.
- Failure and recovery behavior: invalid inputs, unredacted evidence, provider or schema failures,
  and unapproved or duplicate records fail before public writes. Rebuild regenerates derived output
  from the canonical ledger; release rollback follows `docs/ops/rollback.md`.
- Toolchain: TypeScript workspace builds, Oxlint, and Oxfmt follow accepted ADRs and the configured
  repository command contract; generated Action and package build output is never design evidence.
- Validation before merge: choose the narrowest configured names from `VALIDATION.md`, including
  documentation and release-readiness checks when a public contract changes.

## Review Blockers

- The change invents a product domain without a source.
- The change weakens validation or skips required evidence.
- The change relies on generated, cache, or build output as source truth.
- The change duplicates schema vocabulary, bypasses approval before a public write, or makes a
  provider-specific detail part of a shared contract.
- A CLI or Action contract changes without synchronized source, tests, docs, and generated Action
  bundle review where applicable.
