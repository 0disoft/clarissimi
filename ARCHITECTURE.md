# Architecture

- Status: Draft

## Boundary

Clarissimi owns the contribution-recognition schemas, pure policy, redaction, provider adapters,
GitHub evidence collection, deterministic renderers, CLI orchestration, and GitHub Action runner.
It consumes public GitHub evidence, repository-owned configuration, and optional provider APIs. The
MVP writes only the canonical recognition ledger, derived contributor outputs, review drafts, and
reviewable repository changes described in
[`docs/architecture/00-system-boundary.md`](docs/architecture/00-system-boundary.md).

Hosted state, billing, organization dashboards, external databases, public rankings, private
repository optimization, and execution of untrusted pull request head code remain outside the MVP.
Package ownership follows
[`docs/monorepo/package-ownership.md`](docs/monorepo/package-ownership.md); shared schema vocabulary
must not drift into orchestration packages.

## Runtime Flow

A GitHub event or CLI command resolves configuration and evidence before the redaction boundary.
Only redacted, bounded evidence may reach a provider. Provider output remains an untrusted draft
until schema validation, policy, and approval checks pass. Approved records may then enter the
append-only ledger, and every JSON or Markdown view is rebuilt deterministically from that ledger.

Invalid configuration, event mismatches, redaction failures, provider failures, malformed output,
unapproved drafts, and duplicate records fail before public recognition is written. The complete
command and Action paths are defined in
[`docs/architecture/02-runtime-flow.md`](docs/architecture/02-runtime-flow.md).

## Quality Attributes

- Trust: every public recognition claim is backed by bounded repository evidence.
- Privacy and security: evidence is redacted before provider calls; tokens, raw provider output,
  and untrusted pull request code stay outside public output and default execution.
- Integrity: `.clarissimi/contributions.jsonl` is canonical, approved-only, append-only input for
  reproducible derived outputs.
- Maintainability: schema vocabulary remains in `packages/schemas`, package boundaries remain
  narrow, and contract changes update their source-of-truth documents in the same change.
- Operability: dry-run, proposal, and draft-inbox paths keep public writes reviewable; release,
  rollback, and incident evidence stay explicit.
- Performance and portability: collected evidence and provider input stay bounded, and provider
  details do not leak into schema, renderer, CLI, or Action contracts.

The binding review blockers and supporting engineering contracts are listed in
[`docs/architecture/03-quality-attributes.md`](docs/architecture/03-quality-attributes.md).
