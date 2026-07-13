# ADR 0043: Include Automation Contributors by Default

- Status: Accepted
- Date: 2026-07-13
- Owner: Repository maintainers

## Context

Bots and AI agents can author merged pull requests, produce useful reviews, report security issues,
maintain dependencies, and perform release validation. Hiding an approved automation contribution
only because the actor is not human makes the public history incomplete. Treating every bot comment
as a contribution would be equally misleading because routine status noise is not recognition.

GitHub identifies accounts as users or bots but does not provide a reliable universal distinction
between an ordinary bot and an AI agent. Login-name guessing would misclassify accounts and change
behavior when names change.

## Decision

- Add optional contributor kind vocabulary: `human`, `bot`, and `ai_agent`.
- Missing kind remains valid for existing `clarissimi.assessment/v1` records and is treated as an
  unspecified human-compatible legacy identity.
- GitHub actor type `Bot` is collected as `bot`; `User` and `Organization` are collected as
  `human`. GitHub collection never guesses `ai_agent` from a login.
- `ai_agent` must come from an explicitly reviewed assessment or another future authoritative
  source.
- Approved bot and AI-agent assessments appear in contributor Markdown, contributor JSON, gallery,
  and static display data by default.
- Add `includeAutomationContributors`, defaulting to `true`. A maintainer may set it to `false`, use
  CLI `--exclude-automation-contributors`, or set Action input
  `include-automation-contributors: false`.
- Opt-out affects derived contributor displays only. It never deletes or rewrites approved ledger
  records.
- Markdown details label automated identities as `Bot` or `AI agent`.
- A bot comment, review, or check is not automatically a contribution. It must produce a separately
  approved assessment before it appears as recognition.

## Consequences

- Automation receives visible credit under the same maintainer-approval boundary as human work.
- Maintainers retain a simple display opt-out without losing the audit history.
- Bot-authored merged pull requests can be classified automatically from GitHub actor metadata.
- Automatically creating separate assessments for review and comment authors remains a future
  multi-actor ingestion milestone; existing approved draft import can represent those actors now.
- Legacy records do not gain guessed kinds during rebuild.

## Validation

- schema tests for supported kinds, legacy omission, and boolean configuration
- GitHub collection tests for actor-type mapping
- renderer tests for default inclusion, visible labels, and ledger-preserving opt-out
- CLI and Action tests for their opt-out surfaces
- Action bundle freshness plus repository build, format, lint, docs, release-readiness, migration,
  smoke, check, and contract gates
