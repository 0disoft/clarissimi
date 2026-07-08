# ADR 0012: Add Fake Provider Package

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi needs provider adapters, but the first provider implementation must not introduce live
model API calls, SDK dependencies, environment-variable requirements, or provider-specific behavior
that leaks into core policy.

The product specification requires fake deterministic providers for tests. ADR 0007 keeps provider
behavior behind an adapter boundary, and ADR 0011 requires provider inputs to use prepared evidence
from `packages/core`.

## Decision

Implement `packages/providers` with a deterministic fake contribution draft provider.

The package owns:

- the provider adapter interface for contribution draft creation
- provider input types that require `PreparedProviderEvidence`
- a deterministic fake provider used by tests and fixture-first workflows
- validation of fake provider output against `packages/schemas`

The package must not own:

- schema vocabulary
- redaction policy
- maintainer approval policy
- GitHub API collection
- live LLM SDK clients
- filesystem writes, CLI orchestration, or GitHub Action runtime behavior

## Consequences

Core correctness tests can use a provider boundary without calling network services.

Future OpenAI-compatible, Anthropic, Gemini, OpenRouter-compatible, and local model adapters must
implement the same adapter shape without moving provider-specific logic into `packages/core`,
`packages/schemas`, CLI, or Action packages.

The fake provider returns `draft` assessments. Publication still requires the approval gate owned by
`packages/core`.

## Review Blockers

- A provider adapter accepts raw evidence instead of `PreparedProviderEvidence`.
- A provider adapter bypasses schema validation before returning an assessment.
- Provider code duplicates contribution type, impact level, approval status, or evidence kind lists.
- Live provider clients or credentials are added before a separate ADR defines their boundary.
