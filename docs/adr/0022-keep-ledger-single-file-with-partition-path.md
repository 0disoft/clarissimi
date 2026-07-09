# ADR 0022: Keep Ledger Single File with Partition Path

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

`.clarissimi/contributions.jsonl` is the current append-only source of truth for approved
recognition records. A single JSONL file is easy to validate, diff, append, rebuild from, and reason
about during the MVP.

Large repositories may eventually record thousands of contributions. A single file can then create
merge conflicts, noisy diffs, slow GitHub rendering, and awkward release-period reporting. Splitting
the ledger too early would add migration, duplicate detection, ordering, and rebuild complexity
before the MVP proves the recognition workflow.

## Decision

Keep the MVP canonical ledger as:

```text
.clarissimi/contributions.jsonl
```

Do not add monthly or yearly ledger partitions in the MVP.

Document the future migration path as yearly partitions plus an index:

```text
.clarissimi/contributions/index.json
.clarissimi/contributions/2026.jsonl
.clarissimi/contributions/2027.jsonl
```

Yearly partitions are the preferred future split because they reduce file size and conflict
pressure without producing many tiny files. Monthly partitions are deferred until a repository has
enough recognition volume to justify the extra lookup and migration complexity.

Any future partition migration must:

- keep schema versions explicit
- preserve deterministic rebuild behavior
- preserve duplicate detection across all partitions
- keep public derived files rebuildable from approved ledger records
- avoid public total-score, rank, leaderboard, or contributor-tier fields
- provide a migration check before changing the accepted ledger shape

## Consequences

The current CLI and renderers keep one canonical JSONL input. Product and architecture documents
leave room for partitioned storage later without forcing premature complexity into the MVP.

## Validation

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
