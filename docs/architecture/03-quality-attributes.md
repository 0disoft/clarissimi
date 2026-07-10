# Quality Attributes

- Status: Draft

## Boundary

Define what this repository owns, what it consumes, and which contracts cannot drift.

Source of truth:

- `docs/product/02-spec.md`
- `docs/architecture/00-system-boundary.md`
- `docs/architecture/02-runtime-flow.md`
- `docs/engineering/03-performance-budget.md`
- `docs/engineering/08-threat-model.md`
- `docs/engineering/09-data-integrity.md`

## Runtime Flow

Clarissimi quality attributes apply to these MVP flows:

- `clarissimi recognize`: collect fixture or merged pull request evidence, redact provider input,
  create a draft, validate the schema, and return dry-run output unless approval permits rendering.
- `clarissimi stage-draft`: validate an agent-authored draft, sanitize it, and write only review
  inbox data.
- `clarissimi approve-draft`: change a structurally valid draft from `draft` to `approved` without
  writing the public ledger.
- `clarissimi import-draft`: append an approved or auto-approved record to the selected ledger and
  optionally rebuild derived outputs.
- `clarissimi rebuild`: parse the canonical ledger and regenerate derived outputs deterministically.
- GitHub Action `dry-run`, `propose`, and `stage-draft`: run the same evidence, provider,
  validation, approval, and rendering boundaries through runner-safe orchestration.
- GitHub Action `promote-draft`: validate one checked-in approved draft and render the same
  deterministic recognition outputs without evidence collection or provider calls.

Failure behavior is fail-closed:

- Invalid config fails before provider calls.
- GitHub event or pull request mismatch fails before evidence leaves the collector.
- Redaction or provider-preparation failure prevents provider calls.
- Provider failure, malformed provider output, or schema validation failure does not write public
  recognition.
- Draft, rejected, skipped, duplicate, or structurally invalid records cannot enter the public
  ledger.
- Renderer output must be rebuildable from approved ledger records; generated output is never source
  truth.

## Quality Attributes

- Trust: public recognition claims must be backed by bounded repository evidence refs.
- Privacy: raw evidence is untrusted and must be redacted before any live provider call.
- Security: GitHub and provider tokens stay outside public output, logs, fixtures, and committed
  examples.
- Integrity: `.clarissimi/contributions.jsonl` is the MVP canonical approved ledger; derived JSON
  and Markdown outputs must be reproducible from it.
- Maintainability: schema vocabulary stays in `packages/schemas`, package boundaries stay narrow,
  and contract changes update source-of-truth docs in the same change.
- Operability: default write behavior uses dry-run, proposal, or draft-inbox review paths before
  public recognition is applied.
- Performance: provider input, GitHub collection, changed files, comments, linked issues, and patch
  excerpts must stay bounded.
- Portability: provider adapters must not leak model-specific behavior into schema, renderer, CLI,
  or Action contracts.

## Review Blockers

- Public outputs expose numeric contributor scores, ranks, leaderboard fields, raw evidence excerpts,
  or AI/provider provenance.
- A live provider can receive unredacted or unbounded evidence.
- A command or Action path writes public recognition before schema validation and approval checks.
- A ledger or renderer change breaks deterministic rebuilds, duplicate protection, or approved-only
  publication.
- A package takes ownership of secrets, provider calls, GitHub writes, schema vocabulary, or approval
  policy outside its documented boundary.
