# ADR 0002: Treat JSONL Ledger as Source of Truth

- Status: Accepted
- Date: 2026-07-08

## Context

Clarissimi creates durable recognition history. Markdown and profile summaries are useful views, but
they are not stable enough to be the canonical data format.

## Decision

Use `.clarissimi/contributions.jsonl` as the source of truth for approved recognition records.

Derived outputs may include:

- `.clarissimi/contributors.json`
- `CONTRIBUTORS.md`
- release thank-you sections
- static site data

## Consequences

- Ledger entries need schema versions from the first implementation.
- Renderers must be idempotent and rebuildable from the ledger.
- Public Markdown can change format without destroying recognition history.
- Migration tooling becomes part of the product before a stable 1.0 release.
