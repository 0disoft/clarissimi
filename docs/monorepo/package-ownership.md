# Package Ownership

- Status: Draft
- Repository Type: monorepo

## Repository Type Contract

This repository type owns workspace boundaries, package ownership, dependency policy, and change coordination.

## Source of Truth

- Product decision: docs/product/02-spec.md
- Technical owner: Repository maintainers
- Related ADRs: docs/adr/0009-start-schema-package-implementation.md,
  docs/adr/0012-add-fake-provider-package.md,
  docs/adr/0013-add-renderers-package.md,
  docs/adr/0014-add-fixture-first-cli-package.md,
  docs/adr/0015-add-fixture-first-github-collector.md,
  docs/adr/0016-add-dry-run-action-skeleton.md,
  docs/adr/0017-propose-mode-write-boundary.md,
  docs/adr/0018-add-live-github-collector-boundary.md

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
| `packages/github` | Implemented | Fixture-first and injected-client live GitHub merged pull request evidence collection | Token loading, environment handling, domain policy, provider calls, redaction policy, CLI orchestration, Action orchestration, repository writes |
| `packages/providers` | Implemented | Provider adapter interface and deterministic fake contribution draft provider | Schema vocabulary ownership, redaction policy, maintainer approval policy, live LLM SDK clients |
| `packages/renderers` | Implemented | JSONL, derived contributor JSON, Markdown, static-data rendering, output path constants | Evidence collection, provider calls, approval policy, filesystem writes, CLI orchestration, Action orchestration |
| `packages/cli` | Implemented | Local command parsing, fixture-first orchestration, config and ledger validation, rebuild command I/O | Domain policy, schema vocabulary, provider behavior, GitHub API collection, Action runtime |
| `packages/action` | Implemented | GitHub Action entrypoint, environment input resolution, event file reading, live collector routing and token injection, bounded dry-run/propose summaries, internal propose-mode output staging into temporary directories, proposal branch writing and publishing behind narrow local git boundaries, proposal pull request creation/update boundary | Live GitHub evidence normalization, provider token handling, default-branch writes, domain policy, provider behavior |

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- Shared schema vocabulary is duplicated outside `packages/schemas`.
- Planned packages gain implementation before an ADR or package ownership update names the boundary.
- Provider or GitHub packages bypass `packages/redaction` before crossing external trust boundaries.
- CLI, Action, or provider packages duplicate core policy instead of importing it.
