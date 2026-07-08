# ADR 0015: Add Fixture-First GitHub Collector

- Status: Accepted
- Date: 2026-07-08
- Owner: Repository maintainers

## Context

The MVP primary event is a merged GitHub pull request. Existing implementation packages can
validate schemas, redact evidence, draft deterministic assessments from prepared evidence, render
approved outputs, and run fixture-first CLI flows. The repository still needs a package boundary
that turns GitHub-shaped event evidence into Clarissimi's contributor identity and evidence bundle
contracts before live Action orchestration is introduced.

## Decision

Add `packages/github` as a fixture-first GitHub evidence collector package.

The first package slice accepts a merged pull request fixture and produces:

- `ContributorIdentity` from the pull request author
- `EvidenceBundleInput` from pull request, labels, changed files, and merge commit metadata

The package must import shared vocabulary and evidence contracts from `@clarissimi/schemas` and
`@clarissimi/core`. It must not duplicate contribution type, impact level, approval status, or
evidence kind lists.

## Boundaries

`packages/github` owns:

- GitHub-shaped merged pull request fixture types
- deterministic normalization of fixture data into Clarissimi evidence inputs
- contributor profile URL fallback for GitHub logins
- bounded text excerpts for pull request bodies and patch excerpts
- file evidence classification into general file evidence or test evidence

`packages/github` does not own:

- live GitHub API calls
- token handling or environment variable loading
- filesystem reads or writes
- provider calls or prompt construction
- redaction policy
- contribution type, impact level, approval status, or maintainer approval policy
- CLI or GitHub Action orchestration
- linked issue or review comment attribution

## Consequences

The Action and CLI can later depend on a narrow collector boundary without putting GitHub event
shape knowledge into provider, renderer, or policy packages. The first implementation stays safe
for public repository development because it uses only fixture input, no credentials, and no
network access.

Live GitHub collection remains a future ADR because it requires explicit permissions, retries,
pagination, redaction handoff, and error-handling decisions.
