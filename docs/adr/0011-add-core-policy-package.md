# ADR 0011: Add Core Policy Package

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi now has schema validation and deterministic redaction. The next boundary needs to make
those two packages hard to bypass before provider adapters, GitHub collection, CLI orchestration,
or GitHub Action entrypoints exist.

The core package should own policy glue, not runtime shells or external API calls.

## Decision

Implement `packages/core` as a pure policy package.

The package owns:

- preparing evidence for provider boundaries by applying redaction
- preserving source and evidence identity while redacting text-bearing fields
- deriving schema-compatible evidence refs from prepared evidence
- checking whether a validated assessment has a public approval state

The package must not own:

- GitHub API calls
- provider API calls
- prompt construction
- ledger rendering
- CLI orchestration
- GitHub Action orchestration
- security severity decisions

## Consequences

Future provider adapters and execution shells must depend on `packages/core` policy functions instead
of calling schema and redaction packages ad hoc.

Draft assessments remain non-public until `approved` or explicitly `auto_approved`.

The first implementation keeps policy deterministic and dependency-light. Later policy rules can
grow here as long as package ownership stays narrow.

## Review Blockers

- A provider adapter receives unprepared evidence.
- CLI or Action code duplicates approval or redaction policy instead of calling `packages/core`.
- Core starts performing external API calls or filesystem writes.
- Core publishes `draft`, `rejected`, or `skipped` assessments as public records.
