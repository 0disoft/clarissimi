# Package Ownership

- Status: Draft
- Repository Type: monorepo

## Repository Type Contract

This repository type owns workspace boundaries, package ownership, dependency policy, and change coordination.

## Source of Truth

- Product decision: docs/product/02-spec.md
- Technical owner: Repository maintainers
- Related ADR: docs/adr/0009-start-schema-package-implementation.md

## Required Decisions

- Monorepo ownership boundary: each package owns a narrow boundary from the product and ADR
  documents.
- Monorepo public contract: packages expose only documented types, functions, and constants.
- Monorepo validation evidence: implemented packages must pass `typecheck`, `test`, `contract`,
  and `check`.
- Monorepo release or rollout policy: UNDECIDED.
- Monorepo compatibility and migration policy: schema versions must be explicit and migration work
  must be documented before changing accepted public data shapes.

## Package Table

| Package | Status | Owns | Must Not Own |
| --- | --- | --- | --- |
| `packages/schemas` | Implemented | Contribution assessment types, fixed vocabulary, runtime validation, public ranking-language guardrails | GitHub collection, provider calls, redaction, rendering, approval workflow, CLI orchestration, Action orchestration |
| `packages/core` | Implemented | Pure policy glue, prepared evidence redaction, evidence ref derivation, assessment publication gates | Provider API calls, GitHub API calls, prompt construction, filesystem writes, Action runtime concerns |
| `packages/redaction` | Implemented | String and JSON-like value redaction, redaction reports, secret/email/private-key/provider-token masking | Provider API calls, prompt construction, security severity decisions, recognition approval |
| `packages/github` | Planned | GitHub event and evidence collection | Domain policy or provider calls |
| `packages/providers` | Planned | LLM provider adapters and deterministic fake provider | Schema vocabulary ownership |
| `packages/renderers` | Planned | JSONL, JSON, Markdown, and static-data rendering | Evidence collection or provider calls |
| `packages/cli` | Planned | Local command orchestration | Domain policy |
| `packages/action` | Planned | GitHub Action entrypoint | Domain policy |

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- Shared schema vocabulary is duplicated outside `packages/schemas`.
- Planned packages gain implementation before an ADR or package ownership update names the boundary.
- Provider or GitHub packages bypass `packages/redaction` before crossing external trust boundaries.
- CLI, Action, or provider packages duplicate core policy instead of importing it.
