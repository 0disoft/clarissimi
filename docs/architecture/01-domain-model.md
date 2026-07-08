# Domain Model

- Status: Draft

## Core Objects

### ContributionEvent

A repository event that may produce recognition. The MVP focuses on merged pull requests.

### Contributor

A platform identity, initially GitHub-based:

- platform
- id
- login
- profile URL

Email identity is not a default identifier.

### EvidenceRef

A pointer to repository evidence used to support a claim. Evidence must be traceable to public
repository artifacts such as PRs, issues, labels, reviews, commit messages, or changed file
summaries.

### AssessmentDraft

An AI or fake-provider generated draft. It is not public truth and is not a ledger entry.

### RecognitionEntry

A maintainer-approved or policy-approved public recognition record.

### LedgerEntry

An append-only JSONL record. Ledger entries are the source of truth for approved recognition
history.

### ContributorProfile

A derived summary of a contributor's recognized project fingerprints. It may group by contribution
type and area, but it must not expose a public total score.

### Approval

The gate between draft and public record. Valid states are `draft`, `auto_approved`, `approved`,
`rejected`, and `skipped`.

## Contribution Types

- `bug_fix`
- `bug_report`
- `reproduction`
- `test`
- `performance`
- `documentation`
- `security`
- `accessibility`
- `api_design`
- `maintenance`
- `translation`
- `release_validation`
- `example`
- `other`

## Important Language Boundary

`ImpactLevel` describes a contribution event. It does not describe a person's worth, rank, or
quality.

Use:

- high-impact contribution
- medium-impact documentation improvement
- low-impact maintenance update

Avoid:

- high-impact contributor
- medium contributor
- low-quality contributor

## Source-of-Truth Rule

`.clarissimi/contributions.jsonl` is the durable source of truth. `contributors.json`,
`CONTRIBUTORS.md`, release thank-you sections, and static site data are derived views.
