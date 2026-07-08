# ADR 0006: Redact Before Provider Calls

- Status: Accepted
- Date: 2026-07-08

## Context

Pull requests, issues, comments, and diffs can contain tokens, private keys, emails, `.env` content,
security details, and prompt injection.

## Decision

Clarissimi must run redaction before any external provider call.

## Consequences

- Redaction failures fail closed.
- Provider input should use minimal evidence excerpts by default.
- Provider raw responses are not logged by default.
- Security-related recognition needs explicit maintainer or repository evidence before strong impact
  is recorded.
