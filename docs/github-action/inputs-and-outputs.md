# Inputs and Outputs

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Action behavior: `docs/github-action/action-contract.md`
- Product behavior: `docs/product/02-spec.md`
- Default mode: `docs/adr/0008-propose-mode-default.md`

## Current Inputs

- `event-path`: explicit event payload path for local runs, tests, and propose-mode live collection
- `github-fixture`: explicit GitHub merged pull request fixture path for fixture-first runs
- `mode`: `dry-run` or `propose`
- `base-branch`: base branch for proposal pull requests
- `remote-name`: Git remote used to publish proposal branches
- `staging-dir`: optional temporary staging directory for proposal outputs

## Future Inputs

- `config-path`: path to `clarissimi.config.ts` or `.clarissimi/config.json`
- `mode`: `commit`
- `provider`: provider adapter name
- `model`: provider model name
- `pull-request`: explicit pull request number when event resolution is not enough
- `min-confidence`: minimum draft confidence for policy consideration

Provider API keys and GitHub tokens are not plain inputs. They must come from secrets or the
workflow environment. The current Action reads `GITHUB_TOKEN` only in `propose` mode for live
GitHub collection and proposal pull request creation or update.

The current package supports `INPUT_EVENT_PATH`, `GITHUB_EVENT_PATH`, `INPUT_GITHUB_FIXTURE`,
`INPUT_MODE`, `INPUT_BASE_BRANCH`, `INPUT_REMOTE_NAME`, and `INPUT_STAGING_DIR`.

The root `action.yml` currently exposes `event-path`, `github-fixture`, `mode`, `base-branch`,
`remote-name`, and `staging-dir`.
An explicit `github-fixture` input takes precedence over the runner-provided `GITHUB_EVENT_PATH`
fallback. An explicit `event-path` and `github-fixture` must not be provided together.
In `dry-run`, event payloads are mapped from the local event file without live GitHub API calls.
In `propose`, event payloads route to the live GitHub collector when no explicit fixture is
provided.

## Current Outputs

- `draft-count`
- `proposed-entry-count`
- `skipped-entry-count`
- `mode`
- `input-source`
- `approval-status`
- `redaction-match-count`
- `staged-file-count`
- `proposal-branch`
- `proposal-commit-sha`
- `proposal-pull-request-number`
- `proposal-pull-request-url`
- `proposal-pull-request-action`

## Future Outputs

- `summary-path`

Outputs must not include raw provider output, raw diff text, raw issue text, tokens, private keys,
raw pull request bodies, raw patch excerpts, or sensitive security details.

The root `action.yml` currently exposes all current outputs.
The current package also writes the same bounded count, status, and proposal fields to
`GITHUB_STEP_SUMMARY` when the runner provides that path. Step summary content follows the same
raw-evidence exclusion rules as action outputs.

## Review Blockers

- An input encourages hard-coded secrets.
- An output leaks raw evidence.
- Mode names drift from CLI mode names.
- Outputs imply public approval when the result is still only a draft.
