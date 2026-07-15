# ADR 0047: Add a Provider Result Quality Regression Corpus

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

Clarissimi validates provider output against the contribution assessment schema, but schema-valid
JSON alone does not prove that a draft preserves trusted identity and source fields or that strong
security and impact claims have enough repository evidence. Live-provider smoke proves that one
configured model can complete the request; it is not a deterministic correctness oracle and should
not become a merge gate that depends on network access, credentials, or model wording.

Exact prose snapshots are also the wrong oracle. Harmless model or phrasing changes would create
noise while unsupported claims could still pass if they happened to match an approved sentence.

## Decision

- `packages/providers` owns a deterministic provider-result quality validator after shared schema
  validation.
- Provider results must preserve the trusted contributor identity, recognition source, complete
  ordered evidence-reference set, and `draft` approval state supplied by Clarissimi.
- Security recognition or security claims require advisory evidence, test evidence, or an explicit
  security marker in prepared metadata.
- `high` impact requires an explicit maintainer hint, at least four prepared evidence items,
  advisory evidence, or supported security evidence.
- Shared schema guardrails continue to reject public scores, ranks, tiers, point shares, impact
  shares, and time-window contribution percentages.
- A versioned corpus contains 24 synthetic merged pull requests: 12 accepted cases and 12 rejected
  boundary or adversarial cases. The oracle checks issue codes and invariants, not exact generated
  prose.
- Fake and OpenAI-compatible adapters use the same validator. Correctness tests remain local and
  credential-free; live-provider smoke remains an operational compatibility check.

## Consequences

- Provider or prompt changes that weaken accepted semantic boundaries fail deterministically in CI.
- A schema-valid but unsupported strong claim fails before a draft reaches CLI or Action callers.
- The corpus does not claim to measure subjective writing quality, factual completeness beyond the
  prepared evidence, or every model failure. New real failures should become scrubbed corpus cases.
- The validator is a public provider-package export, but it adds no Action input, output, permission,
  approval, ledger, or package-publication change.

## Validation

- 24-case provider result quality corpus
- fake and OpenAI-compatible provider regressions
- Action bundle regeneration and freshness check
- repository `format`, `lint`, `docs`, `release-readiness`, `smoke`, `check`, and `contract` gates
