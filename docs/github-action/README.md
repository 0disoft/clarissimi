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

## Dry-Run Usage

The current `action.yml` is a dry-run-only composite action. It builds the local Action package from
source at runtime and emits a bounded summary. It does not read provider credentials, use GitHub
write tokens, create branches, open pull requests, or update repository files.

Detailed dry-run outputs and failure behavior are defined in `docs/github-action/action-contract.md`.
The write-mode implementation sequence is tracked in
`docs/github-action/propose-implementation-plan.md`.

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

## Review Blockers

- Action permission changes lack least-privilege review.
- Action behavior bypasses redaction or schema validation.
- Outputs or exit behavior changes without workflow examples.
- The Action owns domain policy that should live in core packages.
