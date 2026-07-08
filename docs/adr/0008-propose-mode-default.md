# ADR 0008: Use Propose Mode as the Default Write Mode

- Status: Accepted
- Date: 2026-07-08

## Context

Clarissimi writes public recognition records. Direct commits from a bot can be too surprising for
maintainers, especially while recognition policy is still being tuned.

## Decision

The default write mode is `propose`: Clarissimi opens a pull request with recognition changes.

## Consequences

- Maintainers keep final control.
- Recognition changes remain reviewable.
- `dry-run` remains available for evaluation.
- `commit` mode may exist for small repositories but must be explicitly configured.
