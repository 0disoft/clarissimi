# ADR 0006: Redact Before Provider Calls

- Status: Accepted
- Date: 2026-07-08

## Context

Pull requests, issues, comments, and diffs can contain tokens, private keys, emails, `.env` content,
security details, and prompt injection.

## Decision

Clarissimi must run redaction before any external provider call.

This includes fixture assessment hints. Only the five schema-defined hint fields are accepted;
enums, confidence in [0, 1], and nonempty strings are checked before drafting. Free-text hints
are redacted and their matches contribute to the evidence redaction report. Unknown properties
are discarded, and the external adapter repeats validation and allowlists its final hint payload.

## Consequences

- Redaction failures fail closed.
- Provider input should use minimal evidence excerpts by default.
- Provider raw responses are not logged by default.
- Security-related recognition needs explicit maintainer or repository evidence before strong impact
  is recorded.
