# ADR 0010: Add Redaction Package Boundary

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi reads public repository evidence before preparing recognition drafts. Even public
repository text can contain accidental secrets, private contact details, prompt injection, or
security-sensitive details. The product specification requires redaction before provider calls.

Redaction needs to be available before any provider adapter, GitHub collector, CLI recognition
command, or GitHub Action sends evidence across a trust boundary.

## Decision

Implement `packages/redaction` as a narrow package for deterministic redaction.

The package owns:

- string redaction
- JSON-like value redaction
- redaction reports with match kinds and replacement metadata
- default masking for email addresses, environment-style secret assignments, private key blocks,
  GitHub token-like strings, and common provider token-like strings

The package must not own:

- provider API calls
- prompt construction
- security severity decisions
- maintainer approval
- GitHub evidence collection
- ledger rendering

## Consequences

Provider and GitHub packages must call redaction before sending evidence to any external model
provider or writing public generated text.

Redaction reports intentionally record match kind and location metadata, not the matched secret
value. This keeps diagnostic output useful without creating a second leak path.

The first implementation uses deterministic regular expressions and no external dependency. A later
ADR may add configurable rules or structured detectors if tests show the default set is too small.

## Review Blockers

- A provider adapter can receive raw evidence without redaction.
- Redaction reports include matched secret values.
- Redaction mutates object shape when only string values should be masked.
- Security impact is inferred from redaction alone without maintainer confirmation.
