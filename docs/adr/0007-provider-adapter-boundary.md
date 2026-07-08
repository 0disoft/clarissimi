# ADR 0007: Keep Model Providers Behind an Adapter Boundary

- Status: Accepted
- Date: 2026-07-08

## Context

Clarissimi should work with OpenAI-compatible APIs, Anthropic, Gemini, OpenRouter-compatible
providers, local models, and deterministic fake providers.

## Decision

Provider-specific behavior belongs behind a provider adapter interface. Core policy, schemas,
redaction, rendering, CLI, and Action behavior must not depend on one provider SDK.

## Consequences

- Model choice is configurable.
- Tests can run with fake deterministic providers.
- Provider changes should not rewrite core recognition logic.
- Heavy agent frameworks are avoided in the MVP.
