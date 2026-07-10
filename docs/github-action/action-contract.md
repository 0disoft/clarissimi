# Action Contract

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Action-first decision: `docs/adr/0005-action-first-no-saas.md`
- Propose-mode decision: `docs/adr/0008-propose-mode-default.md`
- Dry-run skeleton decision: `docs/adr/0016-add-dry-run-action-skeleton.md`
- Propose write boundary: `docs/adr/0017-propose-mode-write-boundary.md`
- Live GitHub collector boundary: `docs/adr/0018-add-live-github-collector-boundary.md`
- Provider boundary: `docs/adr/0019-add-openai-compatible-provider-adapter.md`
- Draft inbox Action boundary: `docs/adr/0023-add-action-draft-inbox-proposal-mode.md`
- Approved draft promotion boundary: `docs/adr/0033-promote-approved-drafts.md`
- Explicit Action config path: `docs/adr/0029-add-explicit-action-config-path.md`
- Action summary artifact: `docs/adr/0030-add-action-summary-artifact.md`

## Inputs

The Action supports dry-run summaries, public recognition proposals, and draft inbox proposals. It
accepts:

- `GITHUB_EVENT_PATH`: GitHub event payload path
- `INPUT_EVENT_PATH`: explicit event payload path override for tests and local runs
- `INPUT_GITHUB_FIXTURE`: explicit GitHub merged pull request fixture path
- `INPUT_MODE`: `dry-run`, `propose`, `stage-draft`, or `promote-draft`, default `propose`
- `INPUT_DRAFT_PATH`: approved `.clarissimi/drafts/*.json` path required by `promote-draft`
- `INPUT_CONFIG_PATH`: optional explicit path to a Clarissimi config file
- `INPUT_BASE_BRANCH`: base branch for proposal pull requests, default `main`
- `INPUT_REMOTE_NAME`: remote name used to publish proposal branches, default `origin`
- `INPUT_STAGING_DIR`: optional temporary directory for generated proposal files
- `INPUT_SUMMARY_PATH`: optional workspace-relative path for a sanitized JSON summary artifact
- `INPUT_PROVIDER`: `fake` or `openai-compatible`, default `fake`
- `INPUT_PROVIDER_MODEL`: provider model name required for `openai-compatible`
- `INPUT_PROVIDER_ENDPOINT`: optional OpenAI-compatible chat completions endpoint
- `INPUT_PROVIDER_THINKING`: optional OpenAI-compatible thinking mode, currently only `disabled`
- `CLARISSIMI_PROVIDER_TOKEN`: provider token required only for `openai-compatible`
- `GITHUB_REPOSITORY`: target repository for proposal pull requests in `propose` mode
- `GITHUB_TOKEN`: token used only by `propose` mode for live GitHub collection and proposal pull
  request creation or update

The root `action.yml` exposes the same surface as a composite action:

- `mode`: defaults to `propose`
- `event-path`: optional event payload path override
- `github-fixture`: optional GitHub merged pull request fixture path
- `config-path`: optional explicit path to a JSON Clarissimi config file or `clarissimi.config.ts`
- `base-branch`: defaults to `main`
- `remote-name`: defaults to `origin`
- `staging-dir`: optional temporary staging directory
- `summary-path`: optional workspace-relative path for a sanitized JSON summary artifact
- `provider`: optional provider override; omitted values fall back to config, then the runner fake
  default
- `provider-model`: provider model required for `openai-compatible`
- `provider-endpoint`: optional OpenAI-compatible endpoint
- `provider-thinking`: optional OpenAI-compatible thinking mode, currently only `disabled`
- `draft-path`: approved draft inbox path required by `promote-draft`

The composite Action executes `action-dist/index.js`. Consumer runs must not install repository
dependencies or compile workspace TypeScript. The tracked bundle is derived from the Action source
and must match `pnpm run bundle:action:check` before merge or release. The composite launcher uses
Bash, and Ubuntu is the only currently claimed consumer runner.

The future expanded action contract should include:

- mode: `commit`
- pull request number or event-derived target
- minimum confidence threshold

Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.

Action mode validation is owned inside `packages/action`. Unsupported `INPUT_MODE` values must fail
as usage errors before collection, provider, staging, branch, or pull request work begins.

`config-path` is explicit and optional. The Action does not automatically discover repository config
files. When set, the path is resolved relative to `GITHUB_WORKSPACE` unless it is absolute, loaded,
and validated through `packages/schemas`. Action inputs and workflow environment values take
precedence over config values. Omitted provider inputs fall back to config values, then the runner's
fake provider default. Unsupported `INPUT_MODE` values fail before config-file loading.

`summary-path` is explicit and optional. When set, it must be a relative path that stays inside
`GITHUB_WORKSPACE`. The Action writes the same sanitized JSON summary that it prints to stdout and
emits the resolved path through `summary-json-path`. Invalid summary paths fail before provider
calls or write-mode mutation.

Dry-run mode reads provider credentials only when `provider` is explicitly set to
`openai-compatible`. The default provider is `fake`. The default Action mode is `propose`, which
reads `GITHUB_TOKEN` for live GitHub collection and proposal pull request creation or update.
Fixture-first `propose` succeeds only when the fixture explicitly carries an approved or
auto-approved maintainer approval status. Normal provider drafts remain non-public and fail closed
before branch mutation. Before rendering, propose mode parses the checked-out
`.clarissimi/contributions.jsonl` when present, rejects malformed or duplicate existing records,
and appends the new contribution identity. It rebuilds all derived outputs from that complete
ledger; it must never replace prior recognition history with only the new assessment.

`stage-draft` mode reads `GITHUB_TOKEN` for live GitHub collection and proposal pull request
creation or update. It succeeds only for normal `draft` assessments and stages sanitized
`.clarissimi/drafts/*.json` review files. It must not write `.clarissimi/contributions.jsonl`,
`CONTRIBUTORS.md`, contributor JSON, or static public data.

`promote-draft` reads `GITHUB_TOKEN` only for proposal branch publication and pull request creation
or update. It accepts one approved JSON file under `.clarissimi/drafts/`, performs no provider or
event collection work, renders public recognition outputs, and uses the normal recognition branch
and pull request boundary. It follows the same existing-ledger validation, duplicate rejection,
append, and full derived-output rebuild contract as propose mode. Draft, rejected, or skipped assessments fail before branch mutation. Malformed or internally duplicated ledgers and
already-recorded contribution identities also fail before branch mutation.

Proposal branch commits use a Clarissimi-owned bot author instead of relying on runner-global git
identity. This keeps maintainer workstations and GitHub-hosted runners from becoming part of the
public recognition commit identity.

Before copying staged files into the checked-out repository, the branch writer validates every
existing output path component. Symbolic links, junctions, hard-linked files, and resolved paths
outside `GITHUB_WORKSPACE` fail closed before a file write, commit, push, or pull request mutation.
This applies to `CONTRIBUTORS.md`, canonical ledger and derived data, and draft inbox outputs.

The source repository in collected evidence remains part of the public recognition context. The
pull request target repository comes from `GITHUB_REPOSITORY` when the Action runs in GitHub Actions,
so fixture dogfood can use sample evidence while opening the proposal in the current repository.

## Outputs

The Action emits a bounded JSON summary with:

- recognition draft count
- proposed entry count
- skipped entry count
- output mode
- input source
- approval status when a draft exists
- redaction match count

The root `action.yml` maps these fields to GitHub Action outputs using the same names:
`draft-count`, `proposed-entry-count`, `skipped-entry-count`, `mode`, `input-source`,
`approval-status`, and `redaction-match-count`.

In `propose`, `stage-draft`, and `promote-draft` modes, the Action also emits:

- `staged-file-count`
- `proposal-branch`
- `proposal-commit-sha`
- `proposal-pull-request-number`
- `proposal-pull-request-url`
- `proposal-pull-request-action`
- `summary-json-path` when `summary-path` is set

When `GITHUB_STEP_SUMMARY` is available, the Action appends a bounded Markdown summary with the
same count and status fields. The step summary must not include raw pull request bodies, raw patch
excerpts, raw diffs, provider raw output, tokens, or secrets.

Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details.
The Action also omits raw pull request bodies and raw patch excerpts.

## Failure Contract

The Action uses the following process outcomes:

- Missing input source: exit `1`, empty stdout, usage message on stderr.
- Unsupported mode: exit `1`, empty stdout, usage message on stderr.
- Explicit `event-path` and `github-fixture` together: exit `1`, empty stdout, usage message on
  stderr.
- Malformed JSON or unexpected runtime failure: exit `4`, empty stdout, diagnostic on stderr.
- Unmerged pull request event: exit `0`, JSON stdout with `skipped-entry-count=1`, and bounded step
  summary when `GITHUB_STEP_SUMMARY` is available.
- Missing `GITHUB_TOKEN` in `propose` mode: exit `1`, empty stdout, usage message on stderr.
- Missing `CLARISSIMI_PROVIDER_TOKEN` or `INPUT_PROVIDER_MODEL` for `openai-compatible`: exit `1`,
  empty stdout, usage message on stderr.
- Draft, rejected, or skipped assessment in `propose` mode: exit `4`, empty stdout, diagnostic on
  stderr before branch mutation.
- Approved, auto-approved, rejected, or skipped assessment in `stage-draft` mode: exit `4`, empty
  stdout, diagnostic on stderr before branch mutation.
- Missing or out-of-inbox `draft-path` in `promote-draft`: exit `1`, empty stdout, diagnostic on
  stderr before file reads or branch mutation.
- Invalid, draft, rejected, or skipped assessment in `promote-draft`: exit `4`, empty stdout,
  diagnostic on stderr before branch mutation.

## Permissions

Dry-run mode should need read permissions only. Propose, stage-draft, and promote-draft modes need
the minimum write permissions required to create a proposal branch and pull request.
Commit mode is not implemented.

## Review Blockers

Block changes that introduce any of these conditions:

- Default behavior requires broad write permissions.
- Provider secrets are modeled as plain action inputs.
- The Action runs untrusted PR head code.
- Public outputs include raw evidence or raw provider output.
- `stage-draft` mode writes public recognition outputs or implies maintainer approval.
