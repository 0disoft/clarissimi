# Performance Budget

- Status: Draft

## Contract

Performance budgets track local CLI latency, Action runtime cost, payload size, repeated I/O, and
provider or GitHub request pressure.

Current MVP budgets:

- Correctness tests must stay fixture-first and avoid live network calls.
- Provider input must be bounded prepared evidence, not full raw diffs or unbounded comments.
- GitHub collection must bound review comments, linked issue candidates, changed files, and patch
  excerpts before provider preparation.
- Renderers should rebuild derived outputs from the canonical ledger in memory for the MVP.
- Proposal branches should stage only Clarissimi-owned output files.
- Monthly ledger partitions are deferred until real repository volume justifies the extra lookup
  and migration complexity.

Hot paths:

- `clarissimi recognize`
- `clarissimi stage-draft`
- `clarissimi approve-draft`
- `clarissimi import-draft`
- `clarissimi rebuild`
- GitHub Action `dry-run`, `propose`, and `stage-draft`

## Required Evidence

- Source of truth: `docs/product/02-spec.md`, `docs/architecture/02-runtime-flow.md`,
  `docs/adr/0022-keep-ledger-single-file-with-partition-path.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`
- Related checklist: `.agents/checklists/performance.md`

## Review Blockers

- A change sends unbounded raw evidence to providers.
- A change makes correctness tests depend on live provider or GitHub latency.
- A change adds repeated repository writes or default-branch mutation in write-mode paths.
- A change introduces partitioning, caching, or background work without a migration and invalidation
  story.
