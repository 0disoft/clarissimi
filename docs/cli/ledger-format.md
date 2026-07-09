# Ledger Format

- Status: Draft
- Repository Type: cli-tool

## Purpose

This document explains what Clarissimi writes to the public recognition ledger after a maintainer
approves a draft.

The MVP ledger is:

```text
.clarissimi/contributions.jsonl
```

Each non-empty line is one approved `clarissimi.assessment/v1` JSON object. The file is the
canonical source of truth for public recognition records. `contributors.json`, `CONTRIBUTORS.md`,
and static JSON data are derived outputs and must be rebuildable from the ledger.

## Record Shape

A ledger record contains the same public assessment fields validated by `packages/schemas`:

- `schemaVersion`: currently `clarissimi.assessment/v1`
- `contributor`: GitHub contributor identity
- `contributionType`: the kind of contribution event
- `affectedArea`: the project area touched by the contribution
- `impactLevel`: `low`, `medium`, or `high` impact for this contribution event
- `evidenceSummary`: short evidence-backed summary
- `evidenceRefs`: bounded source references such as PRs, files, labels, reviews, issues, tests, or
  maintainer notes
- `suggestedBadge`: recognition badge text
- `publicRecognitionText`: maintainer-approved public recognition text
- `confidence`: bounded draft confidence for the assessment
- `maintainerApprovalStatus`: `approved` or `auto_approved` for public ledger records
- `source`: repository event identity

Example:

```json
{
  "affectedArea": "provider configuration",
  "confidence": 0.86,
  "contributionType": "test",
  "contributor": {
    "id": "123456",
    "login": "example-contributor",
    "platform": "github",
    "profileUrl": "https://github.com/example-contributor"
  },
  "evidenceRefs": [
    {
      "id": "PR-42",
      "kind": "pull_request",
      "title": "Validate provider endpoint configuration",
      "url": "https://github.com/example/project/pull/42"
    },
    {
      "id": "packages/cli/test/cli.test.mjs",
      "kind": "test",
      "title": "CLI rejects invalid provider endpoint values"
    }
  ],
  "evidenceSummary": "Added validation coverage so invalid provider endpoint configuration fails before provider execution.",
  "impactLevel": "medium",
  "maintainerApprovalStatus": "approved",
  "publicRecognitionText": "Helped make provider configuration fail earlier and more clearly.",
  "schemaVersion": "clarissimi.assessment/v1",
  "source": {
    "event": "merged_pull_request",
    "mergedAt": "2026-07-09T08:14:19Z",
    "pullRequestNumber": 42,
    "repository": "example/project"
  },
  "suggestedBadge": "Configuration Guard"
}
```

## Pull Request Identity

Merged pull request identity is split across two fields:

- `source.pullRequestNumber` stores the PR number used for duplicate detection and rebuild ordering.
- `evidenceRefs[]` stores the human-clickable PR URL when a `pull_request` evidence reference is
  available.

The MVP schema does not store a separate top-level ledger `id` or `source.url`. Consumers should
derive a stable identity from `source.repository`, `source.event`, and `source.pullRequestNumber`.

Within a ledger, public records must be unique for contributor platform, contributor id, repository,
event, and pull request number. `validate-ledger`, `import-draft`, and `rebuild` reject duplicate
contribution identities so derived outputs do not double-count recognition.

## No Public Scores

Ledger records must not contain public contributor scores, average scores, ranks, leaderboard
positions, contributor tiers, or points.

Allowed numeric field:

- `confidence`: confidence in this draft assessment, not a contributor score

Allowed categorical field:

- `impactLevel`: impact of this contribution event, not a person ranking

Rejected examples:

- `score`
- `totalScore`
- `averageScore`
- `rank`
- `leaderboardPosition`
- `contributorTier`
- `points`

Derived contributor profiles may include counts, contribution types, affected areas, badges, and
recognition summaries. They must not compute public average scores or total scores.

Maintainer-only analytics may calculate recent recognition share from the same ledger, but those
results are stdout-only analysis and are not public derived ledger outputs.

## No Draft Provenance

Public ledger records are assessment-only. They must not store AI agent, delegated model, prompt,
token, provider, or draft-envelope provenance. Delegated workflow metadata may exist in local draft
envelopes before review, but CLI draft commands sanitize public records so provenance does not
become repository recognition truth.

## Drafts Versus Ledger

Unapproved assessments belong in the draft inbox:

```text
.clarissimi/drafts/*.json
```

Draft inbox files are maintainer review candidates. They are not public recognition truth and must
not be treated as ledger records.

Only `approved` or explicitly policy-backed `auto_approved` assessments can be imported into
`.clarissimi/contributions.jsonl`.

## Partitioning

The MVP keeps one canonical ledger file. This is intentional because a single JSONL file is easier
to validate, append, diff, and rebuild from while the workflow is still young.

If ledger size or merge conflicts become a real operational problem, the accepted migration path is
yearly partitions plus an index, as described in
[`ADR 0022`](../adr/0022-keep-ledger-single-file-with-partition-path.md). Monthly partitions remain
deferred until repository volume justifies the extra lookup and migration complexity.
