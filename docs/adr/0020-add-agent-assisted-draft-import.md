# ADR 0020: Add Agent-Assisted Draft Import

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

Clarissimi supports provider adapters for automated CLI and GitHub Action runs, but many
maintainers already use AI coding agents such as Codex, Claude Code, Grok, or OpenCode with their
own credential and interaction model. In that workflow, Clarissimi does not need to own provider
credentials or call a live model. The agent can inspect a pull request or issue in conversation,
draft a contribution assessment, and hand Clarissimi a JSON document to validate and render.

This keeps Clarissimi's product identity centered on maintainer-approved contribution recognition
rather than provider orchestration. The AI agent remains the drafter, and Clarissimi remains the
repository-local recorder.

## Decision

Add a CLI import boundary for agent-authored assessment drafts:

```text
clarissimi import-draft --draft <path> [--ledger <path>] [--out-dir <path>] [--json]
```

The command must:

- read either a complete `clarissimi.assessment/v1` contribution assessment JSON document or a
  `clarissimi.draft-envelope/v1` wrapper containing an `assessment`
- validate it with `packages/schemas`
- reject `draft`, `rejected`, or `skipped` assessments before public rendering
- append the approved or auto-approved record to the selected ledger
- refuse to import a duplicate contributor and source pull request already present in the selected
  ledger
- rebuild derived contributors Markdown, contributors JSON, and static JSON from the resulting
  ledger records
- write files only when `--out-dir` is explicit
- keep raw evidence excerpts out of public ledger records through the existing renderer sanitizer
- ignore draft envelope provenance for public ledger output

The command must not:

- call a provider
- read provider tokens
- fetch GitHub evidence
- decide approval status
- mutate the default branch or create pull requests
- accept ranking or leaderboard language in public recognition text
- store AI agent, delegated model, prompt, or provider provenance in public recognition records

## Consequences

Maintainers can use any AI coding agent that can produce a valid Clarissimi assessment draft. The
repository still gets schema validation, approval gates, stable ledger rendering, and idempotent
derived outputs without requiring Clarissimi to know which agent or provider produced the draft.

If the current agent delegates drafting to another LLM, the result may be wrapped in
`clarissimi.draft-envelope/v1` with local provenance metadata. Clarissimi accepts the wrapper for
interoperability, but the public ledger remains assessment-only.

Automated provider mode remains useful for unattended GitHub Action runs, but it is not required for
the first practical agent-assisted workflow.

## Validation

- CLI tests for approved import, delegated envelope import, draft rejection, duplicate rejection,
  ledger append, and derived output rendering
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
