# ADR 0021: Add Draft Inbox Staging

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

Agent-assisted assessment import lets maintainers ask an already-running AI coding agent to draft a
Clarissimi assessment, but a raw chat response or temporary JSON file is not a durable review
surface. Maintainers need a predictable place to inspect a draft before approval without mixing
unapproved records into the public recognition ledger.

The product boundary still matters: AI-generated assessments are review candidates, not public
contribution records. Storing drafts must not bypass the approval gate or turn provider output into
repository truth.

## Decision

Add a draft inbox under:

```text
.clarissimi/drafts/
```

Add a CLI command:

```text
clarissimi stage-draft --draft <path> [--drafts-dir <path>] [--json]
```

The command must:

- read either a `clarissimi.assessment/v1` object or a `clarissimi.draft-envelope/v1` wrapper
- validate the contained assessment with `packages/schemas`
- accept only `maintainerApprovalStatus: "draft"`
- write a sanitized review copy to a deterministic path derived from repository, event, and pull
  request number
- refuse to overwrite an existing staged draft by default
- strip raw evidence excerpts from the staged review copy
- avoid storing AI agent, provider, prompt, model, token, or delegated provenance metadata

The command must not:

- import records into `.clarissimi/contributions.jsonl`
- decide approval status
- call a provider
- fetch GitHub evidence
- create branches or pull requests
- store public leaderboard, rank, score, or total-score language

Approval remains explicit. A maintainer may edit the staged draft, change
`maintainerApprovalStatus` to `approved`, then pass that reviewed file to:

```text
clarissimi import-draft --draft .clarissimi/drafts/<file>.json --out-dir .
```

## Consequences

Clarissimi gains a durable review inbox without changing the public ledger contract. Maintainers can
see the AI-authored draft in the repository, review it in a pull request or local editor, and import
only after approval.

The draft inbox is not a source of truth for public recognition. `.clarissimi/contributions.jsonl`
remains the source of truth for approved public records.

## Validation

- CLI tests for staging a draft, stripping excerpts, rejecting approved inputs, rejecting duplicate
  staged paths, and accepting delegated draft envelopes
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
