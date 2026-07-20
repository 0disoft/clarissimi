# ADR 0057: Add an Opt-In Pre-Merge Review Gate

- Status: Accepted
- Date: 2026-07-20
- Owner: Repository maintainers

## Context

Clarissimi records recognition after merge, so it cannot prove before merge that a maintainer made
an explicit recognition or skip decision. Making the post-merge publisher a required check would
deadlock because it cannot run until after the merge it is meant to gate.

## Decision

Clarissimi adds an opt-in Action mode named `gate` with `advisory` and `required` enforcement.
`advisory` is the default and reports a missing or stale decision without failing. `required` fails
unless exactly one trusted maintainer decision matches the current repository, pull request number,
and 40-character head commit SHA.

The decision schema is `clarissimi.review-decision/v1`. It records `approved` or `skip` plus a
bounded reason inside a pull request comment beginning with
`<!-- clarissimi:review-decision:v1` and ending with `-->`. Only GitHub users whose API
`author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR` are trusted. Incomplete comment scans,
duplicate current decisions, and the absence of one valid trusted current decision fail closed in
`required` mode. Text after the marker may expose a human-readable audit summary, but the validated
JSON object remains the decision source of truth.

Gate mode uses read-scoped GitHub access. It does not check out or execute pull request head code,
call a provider, mutate files, create branches, or publish recognition. A consumer may make its
stable gate job a required ruleset check. The job always runs; advisory mode succeeds rather than
skipping the required check.

The gate proves a decision for the exact revision, not successful post-merge publication.
Publication remains separate, and `skip` prevents automation and Clarissimi-owned PRs from
deadlocking the repository.

## Consequences

A repository can begin with advisory reporting and later enforce the same check. Any new commit
invalidates the prior decision. `pull_request_target` is acceptable only for this read-only gate and
only when no untrusted head revision is checked out or executed.

## Validation

- `pnpm run test`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
