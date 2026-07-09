# Data Integrity

- Status: Draft

## Contract

Data integrity protects assessment schemas, ledger records, duplicate detection, derived outputs,
draft inbox files, and migration paths.

Integrity requirements:

- `clarissimi.assessment/v1` is the assessment schema for drafts and approved records.
- `.clarissimi/contributions.jsonl` is the canonical approved ledger for the MVP.
- Ledger records must be approved or auto-approved public records.
- Draft inbox files under `.clarissimi/drafts/*.json` are review candidates, not public truth.
- Import must reject duplicates for contributor, repository, event, and pull request number.
- Derived outputs must be rebuildable from approved ledger records.
- Public outputs must omit raw evidence excerpts and AI/provider provenance.
- Yearly ledger partitions require a future explicit migration with schema versions, an index, and
  duplicate detection across partitions.

## Required Evidence

- Source of truth: `docs/product/02-spec.md`,
  `docs/adr/0022-keep-ledger-single-file-with-partition-path.md`, `packages/schemas`,
  `packages/renderers`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run lint`, `pnpm run smoke`,
  `pnpm run check`, `pnpm run contract`
- Related checklist: `CHECKLIST.md`

## Review Blockers

- A change writes draft, rejected, skipped, or invalid records into the public ledger.
- A change makes derived outputs non-rebuildable from the ledger.
- A change exposes raw evidence or provider provenance in public records.
- A migration changes ledger shape without explicit validation and rollback guidance.
