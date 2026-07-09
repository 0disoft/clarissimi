# ADR 0024: Add Draft Approval Helper

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

Clarissimi can stage unapproved assessments under `.clarissimi/drafts/` and can import already
approved assessments into `.clarissimi/contributions.jsonl`. That keeps AI drafting separate from
public recognition, but it leaves maintainers editing JSON by hand just to move
`maintainerApprovalStatus` from `draft` to `approved`.

Manual editing is acceptable for an MVP, but it is easy to make the approval path feel rough or
error-prone. The helper must not turn AI output into public recognition by itself, and it must not
combine approval with ledger publication in one hidden operation.

## Decision

Add a CLI helper:

```text
clarissimi approve-draft --draft <path> [--json]
```

The command may update the selected draft file in place by changing
`maintainerApprovalStatus: "draft"` to `maintainerApprovalStatus: "approved"`.

The command must:

- accept only structurally valid `clarissimi.assessment/v1` documents or
  `clarissimi.draft-envelope/v1` wrappers
- accept only drafts whose current `maintainerApprovalStatus` is `draft`
- write only a sanitized assessment document, not an envelope
- omit raw evidence excerpts and AI/provider provenance from the rewritten file
- not import into `.clarissimi/contributions.jsonl`
- not rebuild derived public outputs
- not call providers or GitHub APIs
- leave public recognition publication to `clarissimi import-draft`

The maintainer-controlled publication flow becomes:

```text
clarissimi stage-draft --draft agent-draft.json
clarissimi approve-draft --draft .clarissimi/drafts/<file>.json
clarissimi import-draft --draft .clarissimi/drafts/<file>.json --out-dir .
```

## Consequences

Maintainers get a clear command for the approval step without weakening the approval boundary.
`approve-draft` records maintainer intent in the draft file, while `import-draft` remains the only
CLI command that writes approved records into the public ledger.

## Validation

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
