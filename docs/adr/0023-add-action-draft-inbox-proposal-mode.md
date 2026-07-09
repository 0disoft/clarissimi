# ADR 0023: Add Action Draft Inbox Proposal Mode

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

ADR 0021 adds a CLI draft inbox so maintainers can review AI-authored drafts before approval. That
solves the local agent-assisted workflow, but the Action-first product still needs a repository
review surface when an automated post-merge run creates a normal `draft` assessment.

The existing `propose` mode intentionally rejects draft assessments before branch mutation because
it proposes public recognition files. That guard must remain. A separate Action mode can propose
only `.clarissimi/drafts/*.json` review files without treating the draft as approved public
recognition.

## Decision

Add an Action mode:

```text
stage-draft
```

`stage-draft` mode must:

- collect the same merged pull request evidence as dry-run/propose mode
- run redaction before provider calls
- create exactly one `maintainerApprovalStatus: "draft"` assessment
- stage only a sanitized `.clarissimi/drafts/<source>.json` review file
- open or update a proposal pull request using the existing proposal branch and pull request
  boundaries
- emit bounded Action outputs and step summaries
- keep `.clarissimi/contributions.jsonl`, `CONTRIBUTORS.md`, contributor JSON, and static public
  data untouched

`stage-draft` mode must not:

- publish public recognition files
- approve, auto-approve, reject, or skip assessments
- preserve AI agent, provider, prompt, model, token, raw diff, raw evidence, or raw provider
  provenance in staged files or pull request text
- execute untrusted pull request head code

`propose` mode continues to accept only approved or auto-approved assessments. Draft assessments in
`propose` mode remain a failure before branch mutation.

## Consequences

Maintainers get a GitHub-native review surface for AI-authored drafts. They can edit the staged
draft in the proposal pull request, change `maintainerApprovalStatus` to `approved`, and later
import it into the public ledger.

The public recognition ledger stays approval-gated. Draft staging becomes a review workflow, not a
publication workflow.

## Validation

- Action staging tests for draft inbox files
- Action environment tests for `stage-draft` mode
- proposal branch and pull request tests for draft review metadata
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
