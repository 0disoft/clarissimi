# ADR 0018: Add Live GitHub Collector Boundary

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

ADR 0015 added a fixture-first GitHub collector and deliberately kept live GitHub API calls out of
`packages/github`. The next MVP slice needs enough public merged pull request evidence for the
Action to move beyond static fixtures without checking out or executing untrusted pull request head
code.

Live collection must not turn the GitHub package into an Action shell. Token loading, environment
variables, workflow permissions, branch writes, pull requests, provider calls, and redaction policy
remain outside `packages/github`.

## Decision

`packages/github` may own a live merged pull request collector behind an injected client boundary.

The live collector may collect:

- pull request title, body, author, URL, merged time, labels, changed files, and merge commit sha
- bounded review comment summaries
- bounded linked issue candidate references from issue-style references in pull request text

The live collector must:

- require an already identified repository and pull request number
- verify the pull request is merged before returning evidence
- normalize live API responses through the same evidence collection path as fixtures
- bound text fields before they leave the package
- expose fake-client tests before any Action integration depends on it

The live collector must not:

- read tokens or environment variables
- own retry, rate-limit, or workflow permission policy beyond structured client errors
- call providers or redaction directly
- write files, branches, comments, pull requests, or workflow outputs
- require `pull_request_target` or untrusted pull request head checkout

## Consequences

The Action can later provide a GitHub token and construct a live client without duplicating GitHub
response normalization. Fixture-first tests remain the correctness baseline, while fake-client live
tests cover API shape handling and bounded evidence behavior.
