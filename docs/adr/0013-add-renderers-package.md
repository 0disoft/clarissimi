# ADR 0013: Add Renderer Package

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi needs repository-owned output files after an assessment has passed maintainer or policy
approval. ADR 0002 makes `.clarissimi/contributions.jsonl` the source of truth and treats
contributors JSON, Markdown, and static-site data as rebuildable derived views.

The first renderer implementation should prove idempotent output behavior without adding CLI,
GitHub Action, or filesystem write orchestration.

## Decision

Implement `packages/renderers` as a pure output-rendering package.

The package owns:

- JSONL rendering and parsing for approved public contribution records
- derived contributor profile JSON rendering
- deterministic `CONTRIBUTORS.md` rendering
- static JSON data rendering for a future GitHub Pages view
- stable output path constants for the repository-owned files

The package must not own:

- GitHub evidence collection
- provider calls
- redaction policy
- approval policy
- filesystem writes
- CLI or GitHub Action orchestration

Renderer functions must call `packages/core` approval gates before rendering public outputs. Draft,
rejected, skipped, or structurally invalid assessments must fail before they become ledger or
derived output content.

## Consequences

The fixture-first CLI can later wire renderer functions to actual files without reimplementing
output formats.

Rebuild behavior remains deterministic because renderer outputs avoid timestamps, random IDs, and
count-based public ordering. Contributor profiles may expose contribution counts as summary
metadata, but they must not expose public total scores, ranks, or leaderboard fields.

## Review Blockers

- Renderer code publishes draft, rejected, or skipped assessments.
- Derived outputs introduce public score, rank, leaderboard, or tier fields.
- Renderer code writes files directly instead of returning content to CLI or Action orchestration.
- Renderer code duplicates contribution type, impact level, approval status, or evidence kind
  vocabulary instead of importing schema types.
