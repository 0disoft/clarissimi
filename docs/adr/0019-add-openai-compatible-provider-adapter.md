# ADR 0019: Add OpenAI-Compatible Provider Adapter Boundary

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

Clarissimi has a deterministic fake provider and a redaction boundary before provider input.
Milestone 4 requires an OpenAI-compatible provider behind the existing provider interface, but ADR
0012 blocks live provider clients or credentials until a separate boundary decision exists.

The first live adapter must not make CLI, Action, core, schemas, or renderers depend on one model
provider. It also must not introduce SDK dependencies, environment-variable loading, fake secrets,
or live network calls in correctness tests.

## Decision

Add an OpenAI-compatible HTTP adapter inside `packages/providers`.

The adapter must:

- implement the existing `ContributionDraftProvider` interface
- accept only `PreparedProviderEvidence`, never raw evidence
- use injected `fetch`, endpoint, model, and token options
- allow explicit non-default request compatibility options such as provider thinking disablement
- accept provider message content wrapped in Markdown JSON code fences while still rejecting
  non-JSON content
- avoid SDK dependencies and environment-variable loading
- send only redacted prepared evidence and bounded schema instructions to the provider
- validate model output with `packages/schemas` before returning an assessment
- force returned assessments to `maintainerApprovalStatus: "draft"`
- preserve contributor identity, evidence refs, and source from trusted Clarissimi inputs
- avoid exposing raw provider output in thrown errors by default

Credential loading remains outside `packages/providers`. CLI, GitHub Action, and local runtime
integration must pass credentials explicitly from their own trusted boundaries in a later slice.
Compatibility options are non-secret request-shaping values and must remain opt-in so the default
OpenAI-compatible path sends only the standard chat completions request fields.

## Consequences

Provider correctness tests can use fake `fetch` implementations without live credentials.

The adapter proves the model boundary without making public release depend on one vendor SDK or a
developer workstation secret. Optional live smoke tests may be added later, but they must be
explicit and skipped when credentials are absent.

## Review Blockers

- The adapter reads provider tokens from environment variables.
- The adapter accepts unredacted evidence.
- Raw provider output appears in logs, Action summaries, CLI JSON, or thrown error messages.
- Model output can mark a contribution approved or alter contributor identity, evidence refs, or
  source identity.
- Core, schemas, renderers, CLI, or Action packages import provider-specific behavior.
