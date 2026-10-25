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

The shared GitHub token rule covers `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, and fine-grained
`github_pat_` prefixes under the existing `github_token` report kind. Detection keeps the existing
minimum of 16 token-body characters and word boundaries; it identifies token-like text rather than
verifying whether a credential is valid. Provider preparation and repository-visible text checks
must both use this shared rule, including for values inside nonsensitive JSON fields.

Generic secret assignment detection accepts a closing quote after the existing `token`, `secret`,
`password`, and `api[_-]?key` keywords. This masks quoted JSON keys in evidence strings, including
file text and diffs, before they are copied into provider evidence items and reference excerpts.
The existing eight-character minimum, rule order, and `generic_secret_assignment` report kind
remain unchanged. Regressions cover 56 quoted-key/value and separator combinations, occurrence
offsets, longer nonsensitive key names, and the request body captured by an injected provider.

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

The 2026-10-26 email matcher first scans maximal local-part tokens and checks whether each is
followed by `@`. It attempts the existing email expression only at the token's first word boundary,
using a sticky expression to prevent retries at later boundaries after a failed domain match.
Successful matches advance the token scanner past the matched address. This keeps email scanning
linear in input length instead of quadratic on repeated `a.` near misses, while preserving masking
order, accepted addresses, and occurrence offsets. A child-process deadline regression covers long
near misses and a 512 KiB text; compatibility cases cover punctuation and adjacent addresses.

Private-key block masking scans BEGIN and END markers separately. Successful matches advance past
the matched END; if the first pending BEGIN has no END, scanning stops because no later BEGIN can
complete a block either. This bounds delimiter scanning to linear time instead of rescanning an
unterminated suffix for every BEGIN. Existing accepted marker prefixes, mismatched prefix behavior,
replacement order, unmatched text, and occurrence offsets remain unchanged. Compatibility cases
cover nesting and overlapping markers, and a child-process deadline covers repeated unterminated
headers, including a tail after a complete block.

## Review Blockers

- A provider adapter can receive raw evidence without redaction.
- Redaction reports include matched secret values.
- Redaction mutates object shape when only string values should be masked.
- Security impact is inferred from redaction alone without maintainer confirmation.
