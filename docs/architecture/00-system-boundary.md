# System Boundary

- Status: Draft

## Repository Ownership

This repository owns the open-source Clarissimi engine:

- product principles
- schemas and ledger contracts
- pure recognition policy
- redaction layer
- provider adapters
- GitHub evidence collection
- renderers for repository-owned output
- CLI orchestration
- GitHub Action entrypoint
- docs, examples, and fixture tests

## External Systems

Clarissimi consumes:

- GitHub event payloads and REST or GraphQL API data
- public repository pull request and issue evidence
- user-provided Clarissimi config
- optional LLM provider APIs

Clarissimi writes only to the target repository in the MVP:

- `.clarissimi/contributions.jsonl`
- `.clarissimi/contributors.json`
- `CONTRIBUTORS.md`
- proposed recognition pull requests
- dry-run summaries

## Out of Boundary for MVP

- hosted SaaS state
- billing
- organization dashboards
- external database
- public leaderboard
- private repository optimization
- GitLab or Bitbucket support
- Slack or Discord notifications
- automatic execution of untrusted pull request head code

## Package Boundary

- `schemas` owns shared data contracts and imports no internal package.
- `core` owns pure domain policy and imports no GitHub, provider, renderer, CLI, or Action package.
- `redaction` owns provider-boundary sanitization.
- `github` owns collection and normalization from GitHub.
- `providers` owns model calls and fake deterministic providers.
- `renderers` owns JSONL, JSON, Markdown, and static-data output.
- `cli` owns user command orchestration.
- `action` is a thin runner wrapper.

## Quality Attributes

- Trust: every public recognition claim is evidence-backed.
- Privacy: redaction happens before provider calls.
- Security: GitHub Action permissions are least privilege.
- Maintainability: ledger schema stability matters more than implementation convenience.
- Portability: model providers are adapters, not core dependencies.
- Operability: dry-run and propose modes make maintainer review cheap.
