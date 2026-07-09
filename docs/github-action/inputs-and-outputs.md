# Inputs and Outputs

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Action behavior: `docs/github-action/action-contract.md`
- Product behavior: `docs/product/02-spec.md`
- Default mode: `docs/adr/0008-propose-mode-default.md`
- Draft review mode: `docs/adr/0023-add-action-draft-inbox-proposal-mode.md`

## Current Inputs

- `event-path`: explicit event payload path for local runs, tests, and write-mode live collection
- `github-fixture`: explicit GitHub merged pull request fixture path for fixture-first runs
- `config-path`: optional explicit path to a JSON Clarissimi config file or `clarissimi.config.ts`
- `mode`: `dry-run`, `propose`, or `stage-draft`, default `propose`
- `base-branch`: base branch for proposal pull requests
- `remote-name`: Git remote used to publish proposal branches
- `staging-dir`: optional temporary staging directory for proposal outputs
- `provider`: `fake` or `openai-compatible`; omitted values fall back to config, then `fake`
- `provider-model`: model name required when `provider` is `openai-compatible`
- `provider-endpoint`: optional OpenAI-compatible chat completions endpoint
- `provider-thinking`: optional OpenAI-compatible thinking mode; currently only `disabled`

## Future Inputs

- `mode`: `commit`
- `pull-request`: explicit pull request number when event resolution is not enough
- `min-confidence`: minimum draft confidence for policy consideration

Provider API keys and GitHub tokens are not plain inputs. They must come from secrets or the
workflow environment. The current Action reads `GITHUB_TOKEN` only in `propose` and `stage-draft`
modes for live GitHub collection and proposal pull request creation or update. It reads
`CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.

The current package supports `INPUT_EVENT_PATH`, `GITHUB_EVENT_PATH`, `INPUT_GITHUB_FIXTURE`,
`INPUT_CONFIG_PATH`, `INPUT_MODE`, `INPUT_BASE_BRANCH`, `INPUT_REMOTE_NAME`, `INPUT_STAGING_DIR`,
`INPUT_PROVIDER`, `INPUT_PROVIDER_MODEL`, `INPUT_PROVIDER_ENDPOINT`, and
`INPUT_PROVIDER_THINKING`.

The root `action.yml` currently exposes `event-path`, `github-fixture`, `mode`, `base-branch`,
`remote-name`, `staging-dir`, `config-path`, `provider`, `provider-model`, `provider-endpoint`,
and `provider-thinking`.
`config-path` is explicit-only; the Action does not automatically discover repository config files.
Action inputs and workflow environment values take precedence over config values. Omitted provider
inputs fall back to config values, then `fake`.
An explicit `github-fixture` input takes precedence over the runner-provided `GITHUB_EVENT_PATH`
fallback. An explicit `event-path` and `github-fixture` must not be provided together.
In `dry-run`, event payloads are mapped from the local event file without live GitHub API calls.
In `propose` and `stage-draft`, event payloads route to the live GitHub collector when no explicit
fixture is provided.

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
