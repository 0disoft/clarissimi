# Shell Completion

- Status: Deferred
- Repository Type: cli-tool

## Decision

Shell completion is not part of the MVP.

## Rationale

The first implementation must stabilize schemas, ledger validation, fixture recognition, redaction,
and renderer idempotency before adding shell integration.

## Future Contract

When added, completion should cover:

- command names
- `--mode` values
- config path flags
- provider identifiers
- output format flags

Completion must not inspect repository files in a way that exposes secrets or generated output.

## Review Blockers

- Completion is added before command names stabilize.
- Completion reads `.clarissimi` data without a privacy review.
- Completion behavior is not covered by smoke validation.
