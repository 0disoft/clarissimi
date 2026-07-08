# Permissions

- Status: Draft
- Repository Type: github-action

## Permission Principle

Clarissimi should request the narrowest permissions required for the selected mode.

## Dry-Run Mode

Expected permissions:

- `contents: read`
- `pull-requests: read`
- `issues: read`

Dry-run mode should not write recognition files, branches, comments, or pull requests.

## Propose Mode

Expected permissions:

- `contents: write`
- `pull-requests: write`
- `issues: read`

Propose mode writes to a branch and opens a pull request for maintainer review.

## Commit Mode

Commit mode requires explicit configuration and should not be the default.

Expected permissions:

- `contents: write`
- `pull-requests: read`
- `issues: read`

## Event Safety

Avoid default `pull_request_target` examples. Do not checkout or execute untrusted pull request head
code.

## Review Blockers

- A workflow asks for broad write permissions in dry-run mode.
- `pull_request_target` is documented as the default path.
- Secrets are exposed to untrusted fork code.
- Permission changes are not reflected in examples and tests.
