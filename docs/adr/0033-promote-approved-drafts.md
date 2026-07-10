# ADR 0033: Promote Approved Drafts Through the Action

- Status: Accepted
- Owner: Repository maintainers

## Context

`stage-draft` opens a pull request containing a sanitized draft inbox file, and the CLI can approve
and import that file. The GitHub Action does not yet provide the second half of that loop. A
maintainer who adopts the Action must leave GitHub Actions, run local CLI commands, and create the
public recognition change separately.

Normal provider output remains a draft by design. Letting a provider silently change approval or
publishing immediately after draft generation would violate the maintainer-approval boundary.

## Decision

Add an explicit `promote-draft` Action mode and a `draft-path` input.

- `draft-path` is required in `promote-draft` mode, must be repository-relative, must point to a JSON
  file under `.clarissimi/drafts/`, and must stay inside `GITHUB_WORKSPACE`. Lexical and real-path
  containment checks reject traversal and symlink escapes before reading the draft.
- The checked-in draft must validate as `clarissimi.assessment/v1` and have
  `maintainerApprovalStatus` equal to `approved` or `auto_approved`.
- Promotion does not read event or fixture inputs, execute repository config, call a provider, or
  read provider credentials.
- Promotion renders the canonical ledger and derived recognition outputs, publishes the existing
  deterministic `clarissimi/recognition/<source-kind>-<source-id>` branch, and opens or updates the
  normal recognition proposal pull request.
- Promotion parses the checked-out canonical ledger first, rejects malformed or duplicate existing
  records, rejects a promoted contribution identity that is already present, appends the approved
  assessment, and rebuilds every derived output from the complete ledger.
- Promotion never writes directly to the default branch. The proposal pull request remains the
  final maintainer merge gate.
- The approved draft inbox file remains in place. Removing or archiving draft files is a separate
  retention decision and must not be smuggled into publication.
- Recommended automation is manual `workflow_dispatch` after the reviewed draft pull request has
  merged. Automatic promotion on arbitrary pull request events is not supported.
- `redaction-match-count` is zero during promotion because promotion processes an already sanitized
  draft and performs no new evidence redaction pass.

## Consequences

Maintainers can complete the safe path entirely through GitHub:

1. run `stage-draft` after a merged contribution
2. review and approve the staged JSON in its pull request
3. merge the approved draft
4. manually run `promote-draft` for that draft path
5. review and merge the resulting public recognition pull request

The flow stays deliberately two-review. Approval of the draft and publication of public outputs are
separate maintainer decisions.

`v0.1.0` remains immutable and does not gain this mode. A later immutable patch release requires
external consumer smoke before advertising `promote-draft` as available.

## Validation

- `pnpm run bundle:action:check`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- hosted write-mode smoke for the release candidate
- external consumer smoke for the immutable release tag
