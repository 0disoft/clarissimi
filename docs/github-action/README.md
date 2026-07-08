# GitHub Action

- Status: Draft
- Repository Type: github-action

## Purpose

The GitHub Action is the installable automation surface for public repositories. It should collect
safe post-merge evidence, draft recognition, and propose repository-owned recognition files for
maintainer review.

The Action is a thin entrypoint. Domain logic belongs in core packages and the CLI orchestration
layer.

## Default Behavior

- Runs after merge or default-branch update.
- Loads Clarissimi config from the target repository.
- Collects bounded public GitHub evidence.
- Runs redaction before provider calls.
- Validates provider output against schemas.
- Produces a dry-run summary or proposed recognition pull request.

## Default Write Mode

`propose`

This means the Action should open a pull request with recognition changes instead of directly
committing to the default branch.

## Security Boundary

Avoid default `pull_request_target` behavior. Do not checkout or execute untrusted fork PR head
code.

## Action Usage

The current `action.yml` supports read-only `dry-run` mode and fixture-first `propose` mode. It
builds the local Action package from source at runtime. Dry-run mode emits a bounded summary and
does not read provider credentials, use GitHub write tokens, create branches, open pull requests, or
update repository files. Propose mode stages approved fixture-first recognition output, publishes a
proposal branch, and opens or updates a pull request.

Detailed outputs and failure behavior are defined in `docs/github-action/action-contract.md`. The
remaining implementation sequence is tracked in `docs/github-action/propose-implementation-plan.md`.

Example read-only workflow:

```yaml
name: Clarissimi dry run

on:
  pull_request:
    types:
      - closed

permissions:
  contents: read
  pull-requests: read
  issues: read

jobs:
  recognize:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: 0disoft/clarissimi@main
        with:
          mode: dry-run
```

For local fixture checks, pass `github-fixture`:

```yaml
- uses: 0disoft/clarissimi@main
  with:
    mode: dry-run
    github-fixture: fixtures/github-merged-pr-basic.json
```

For local or CI checks against a GitHub event payload file, pass `event-path`:

```yaml
- uses: 0disoft/clarissimi@main
  with:
    mode: dry-run
    event-path: fixtures/github-pull-request-merged-event.json
```

This repository dogfoods the root Action with both `github-fixture` and `event-path` inputs in
`.github/workflows/clarissimi-dry-run.yml`.

Fixture-first propose mode requires an approved or auto-approved fixture and write permissions:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: read

steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0
  - uses: 0disoft/clarissimi@main
    with:
      mode: propose
      github-fixture: fixtures/github-merged-pr-approved.json
      base-branch: main
```

## Review Blockers

- Action permission changes lack least-privilege review.
- Action behavior bypasses redaction or schema validation.
- Outputs or exit behavior changes without workflow examples.
- The Action owns domain policy that should live in core packages.
