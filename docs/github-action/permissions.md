# Permissions

- Status: Draft
- Repository Type: github-action

## Permission Principle

Clarissimi should request the narrowest permissions required for the selected mode.
Workflow examples must use explicit `permissions`. A workflow must not use `write-all`.

## Permission Matrix

| Mode            | `contents` | `pull-requests` | `issues` | Writes repository files          | Opens pull request |
| --------------- | ---------- | --------------- | -------- | -------------------------------- | ------------------ |
| `dry-run`       | `read`     | `read`          | `read`   | No                               | No                 |
| `propose`       | `write`    | `write`         | `read`   | Proposal branch only             | Yes                |
| `stage-draft`   | `write`    | `write`         | `read`   | Draft proposal branch only       | Yes                |
| `promote-draft` | `write`    | `write`         | `read`   | Recognition proposal branch only | Yes                |
| `commit`        | `write`    | `read`          | `read`   | Current branch                   | No                 |

Any permission not listed in a workflow should remain unset, which GitHub treats as `none` when
the workflow uses an explicit `permissions` block.

## Dry-Run Mode

Expected permissions:

- `contents: read`
- `pull-requests: read`
- `issues: read`

Dry-run mode should not write recognition files, branches, comments, or pull requests.

The current package skeleton performs only local event-file or fixture-file reads. It does not use
GitHub token permissions, create branches, write comments, create pull requests, or update
repository files.

The root `action.yml` dry-run example should stay read-only. Do not document `pull_request_target`
as the default event.

## Propose Mode

Expected permissions:

- `contents: write`
- `pull-requests: write`
- `issues: read`

Propose mode writes to a branch and opens a pull request for maintainer review.

When `comment-mode: upsert` is enabled, propose mode also creates or updates one managed status
comment on the merged source pull request. GitHub permits issue-comment list, create, and update
through `pull-requests: write`, so `issues: write` is not required.

The proposal branch name should be deterministic and scoped under
`clarissimi/recognition/<source-kind>-<source-id>`. The proposal pull request title should start
with `Clarissimi recognition:`.

The target repository or organization may need to allow GitHub Actions to create pull requests.
If that setting blocks pull request creation, Clarissimi should fail with an actionable diagnostic
instead of falling back to direct commits or broader credentials.

## Stage-Draft Mode

Expected permissions:

- `contents: write`
- `pull-requests: write`
- `issues: read`

Stage-draft mode writes only a sanitized draft inbox file to a branch and opens a pull request for
maintainer review. It must not update public recognition outputs.

The optional source pull request status comment uses the same `pull-requests: write` permission and
does not change the `issues: read` boundary.

The proposal branch name should be deterministic and scoped under
`clarissimi/drafts/<source-kind>-<source-id>`. The proposal pull request title should start with
`Clarissimi draft review:`.

## Commit Mode

Commit mode requires explicit configuration and should not be the default.

Expected permissions:

- `contents: write`
- `pull-requests: read`
- `issues: read`

Commit mode writes only Clarissimi-owned recognition files, requires a clean checkout and matching
expected HEAD, and pushes without force to the configured target branch. A concurrent update or
branch protection rejection fails closed. Repository owners should retain branch protection when
they want CI, signed-commit, or actor restrictions beyond Clarissimi's file and validation boundary.

## Promote-Draft Mode

Expected permissions:

- `contents: write`
- `pull-requests: write`
- `issues: read`

Promotion reads one approved draft under `.clarissimi/drafts/`, writes only Clarissimi recognition
outputs to a proposal branch, and opens or updates the normal recognition pull request. It does not
call a provider or write directly to the default branch.

Promotion may update the same opt-in source pull request status comment from draft review to
recognition proposal state. Direct commit mode intentionally does not support comment updates.

## Event Safety

Avoid default `pull_request_target` examples. Do not checkout or execute untrusted pull request head
code.

`propose`, `commit`, and `stage-draft` modes should run after safe post-merge events, explicit manual
dispatch, or another event that does not require running untrusted pull request head code.

## Review Blockers

- A workflow asks for broad write permissions in dry-run mode.
- A workflow uses `write-all`.
- `pull_request_target` is documented as the default path.
- Secrets are exposed to untrusted fork code.
- Permission changes are not reflected in examples and tests.
