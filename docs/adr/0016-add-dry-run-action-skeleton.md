# ADR 0016: Add Dry-Run Action Skeleton

- Status: Accepted
- Date: 2026-07-08
- Owner: Repository maintainers

## Context

Clarissimi now has schema, redaction, core policy, GitHub fixture collection, fake provider,
renderer, and CLI packages. The next MVP slice needs a GitHub Action entrypoint boundary without
introducing live GitHub API calls, token handling, branch writes, or pull request creation before
the permission and write-mode contracts are hardened.

## Decision

Add `packages/action` as a dry-run-only GitHub Action skeleton.

The first package slice may:

- read a GitHub event JSON file from `GITHUB_EVENT_PATH`
- read an explicit GitHub merged pull request fixture path from `INPUT_GITHUB_FIXTURE`
- map a merged pull request event payload into the `packages/github` fixture contract
- run the existing collector, redaction, and fake-provider draft flow
- emit a bounded dry-run summary for CI logs and tests

The first package slice must not:

- call the live GitHub API
- read GitHub tokens or provider API keys
- create branches, comments, commits, pull requests, or repository files
- support `propose` or `commit` mode
- run untrusted pull request head code
- expose raw pull request bodies, raw diffs, raw patch excerpts, provider raw responses, or secrets

## Boundaries

`packages/action` owns:

- GitHub Action environment input resolution
- safe event-file reading
- dry-run summary shape
- Action exit-code mapping for the skeleton

`packages/action` does not own:

- schema vocabulary
- redaction policy
- contribution policy or maintainer approval policy
- GitHub live API collection
- provider adapter behavior
- renderer output file writes
- CLI command parsing

## Consequences

The Action package can be tested locally without secrets, network access, or workflow write
permissions. It also gives the future `action.yml` implementation a narrow entrypoint to call.

`propose` and `commit` modes remain future work because they require explicit permission,
checkout, branch, pull request, and rollback decisions.
