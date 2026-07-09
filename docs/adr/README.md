# Architecture Decisions

- Status: Draft
- Owner: Repository maintainers

## Purpose

Architecture decisions record the product boundaries that keep Clarissimi from drifting into a
scoring product, hosted SaaS, or provider-specific workflow before the MVP proves the recognition
engine.

## Accepted ADRs

- `0001-initial-architecture-boundaries.md`: use a public monorepo
- `0002-contract-source-of-truth.md`: treat JSONL ledger as source of truth
- `0003-ai-as-drafter-not-judge.md`: AI drafts; maintainers approve
- `0004-no-public-leaderboard.md`: do not ship public rankings or total scores
- `0005-action-first-no-saas.md`: start with GitHub Action and CLI
- `0006-redaction-before-provider.md`: redact before provider calls
- `0007-provider-adapter-boundary.md`: keep model providers behind adapters
- `0008-propose-mode-default.md`: default write mode is proposed pull request
- `0009-start-schema-package-implementation.md`: start implementation with `packages/schemas`
- `0010-add-redaction-package-boundary.md`: add deterministic redaction before provider calls
- `0011-add-core-policy-package.md`: add pure policy glue for prepared evidence and approval gates
- `0012-add-fake-provider-package.md`: add deterministic fake provider adapter package
- `0013-add-renderers-package.md`: add deterministic repository output renderers
- `0014-add-fixture-first-cli-package.md`: add local fixture-first CLI orchestration
- `0015-add-fixture-first-github-collector.md`: add fixture-first GitHub merged PR evidence collection
- `0016-add-dry-run-action-skeleton.md`: add dry-run-only GitHub Action entrypoint skeleton
- `0017-propose-mode-write-boundary.md`: define propose-mode branch, pull request, and permission boundaries
- `0018-add-live-github-collector-boundary.md`: add live GitHub collector boundary
- `0019-add-openai-compatible-provider-adapter.md`: add SDK-free OpenAI-compatible provider adapter

## Review Blockers

- A change contradicts an accepted ADR without adding a superseding ADR.
- A change exposes public contributor scores or rankings.
- A change moves domain policy into the CLI or GitHub Action shell.
- A change duplicates schema vocabulary instead of importing it from `packages/schemas`.
- A change bypasses redaction, schema validation, or maintainer approval boundaries.
