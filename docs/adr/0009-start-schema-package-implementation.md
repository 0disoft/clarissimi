# ADR 0009: Start Schema Package Implementation

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi's first executable boundary needs to be the contribution schema, not the GitHub Action,
CLI shell, provider adapters, or renderers. The product contract already defines fixed contribution
types, impact levels, approval states, evidence refs, and the recognition draft fields.

Keeping those values only in Markdown would make every later package reinterpret the contract.

## Decision

Start implementation with `packages/schemas` as the first workspace package.

The package owns:

- TypeScript types for contribution assessments and related vocabulary
- fixed enum-like value sets from the product specification
- minimal runtime validation for assessment drafts
- public-output guardrails that reject obvious scoring or ranking language

The package must not own:

- GitHub API collection
- LLM provider calls
- redaction implementation
- ledger rendering
- maintainer approval workflows
- CLI or GitHub Action orchestration

## Consequences

Other packages must import schema vocabulary instead of redefining it.

Runtime validation starts without an external schema library. A later ADR may add a schema library
if handwritten validators become hard to audit or maintain.

Root validation can now run real `typecheck`, `test`, `contract`, and `check` commands for the
implemented package while leaving unimplemented validation names explicitly failing.

`package.json` becomes project-owned runner configuration after this ADR. `ssealed doctor` may
report the runner block as modified; that is scaffold provenance drift, not implementation test
failure. The merge gate for implemented packages is the repository validation command set.

## Review Blockers

- A later package duplicates contribution type, impact level, approval status, or evidence kind
  vocabulary instead of importing it.
- Schema validation permits public ranking or total-score phrasing in recognition text.
- CLI, GitHub Action, provider, or renderer behavior is added to `packages/schemas`.
