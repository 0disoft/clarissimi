# ADR 0001: Use a Public Monorepo

- Status: Accepted
- Date: 2026-07-08

## Context

Clarissimi needs a GitHub Action, CLI, schemas, core policy, redaction, provider adapters, renderers,
fixtures, examples, and documentation. These surfaces are tightly coupled during the MVP because
schema and ledger decisions affect every runtime surface.

## Decision

Use a single public monorepo for the initial repository.

The intended package boundaries are:

- `packages/schemas`
- `packages/core`
- `packages/redaction`
- `packages/github`
- `packages/providers`
- `packages/renderers`
- `packages/cli`
- `packages/action`

## Consequences

- Versioning and release coordination stay simple during the early schema phase.
- Action, CLI, docs, examples, and fixtures can evolve together.
- Package boundaries must be enforced by tests or import rules once implementation begins.
- Public repository visibility supports trust in prompts, rubric, redaction, schemas, and security
  model.
