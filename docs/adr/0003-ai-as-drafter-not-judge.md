# ADR 0003: AI Is a Drafter, Not a Judge

- Status: Accepted
- Date: 2026-07-08

## Context

Clarissimi uses LLMs to summarize repository evidence, but open-source communities should not be
asked to trust an AI model as the authority on contributor value.

## Decision

AI may draft structured assessment records from evidence. Maintainer policy or explicit maintainer
approval decides whether a recognition entry becomes public.

## Consequences

- Provider output is never public truth by itself.
- Recognition drafts must pass schema validation and policy checks.
- Public messaging must avoid AI judgment language.
- Fake deterministic providers are required for tests.
