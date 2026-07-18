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
- Explicit direct commit mode: `docs/adr/0038-add-explicit-direct-commit-mode.md`
- Provider quality failure summary: `docs/adr/0048-report-provider-quality-failures-in-action-summary.md`
- Source pull request comment updates: `docs/adr/0053-add-opt-in-source-pr-comment-updates.md`

## Inputs

The Action supports dry-run summaries, public recognition proposals, direct commits, and draft
inbox proposals. It accepts:

- `GITHUB_EVENT_PATH`: GitHub event payload path
- `INPUT_EVENT_PATH`: explicit event payload path override for tests and local runs
- `INPUT_GITHUB_FIXTURE`: explicit GitHub merged pull request fixture path
- `INPUT_MODE`: `dry-run`, `propose`, `commit`, `stage-draft`, or `promote-draft`, default `propose`
- `INPUT_DRAFT_PATH`: approved `.clarissimi/drafts/*.json` path required by `promote-draft`
- `INPUT_CONFIG_PATH`: optional explicit path to a Clarissimi config file
- `INPUT_COMMENT_MODE`: `none` or `upsert`, default `none`; supported only by proposal modes
- `INPUT_BASE_BRANCH`: base branch for proposal pull requests, default `main`
- `INPUT_REMOTE_NAME`: remote name used to publish proposal branches, default `origin`
- `INPUT_STAGING_DIR`: optional temporary directory for generated proposal files
- `INPUT_SUMMARY_PATH`: optional workspace-relative path for a sanitized JSON summary artifact
- `INPUT_PROVIDER`: `fake` or `openai-compatible`, default `fake`
- `INPUT_PROVIDER_MODEL`: provider model name required for `openai-compatible`
- `INPUT_PROVIDER_ENDPOINT`: optional OpenAI-compatible chat completions endpoint
- `INPUT_PROVIDER_ENDPOINT_TRUST`: `public` or `private-network`, default `public`
- `INPUT_PROVIDER_THINKING`: optional OpenAI-compatible thinking mode, currently only `disabled`
- `CLARISSIMI_PROVIDER_TOKEN`: provider token required only for `openai-compatible`
- `GITHUB_REPOSITORY`: target repository for proposal pull requests in `propose` mode
- `GITHUB_TOKEN`: token used by write modes for live GitHub collection and repository publication

The root `action.yml` exposes the same surface as a composite action:

- `mode`: defaults to `propose`
- `event-path`: optional event payload path override
- `github-fixture`: optional GitHub merged pull request fixture path
- `config-path`: optional explicit path to a JSON Clarissimi config file or `clarissimi.config.ts`
- `markdown-summary`: optional `none`, `table`, or `gallery` layout for generated
  `CONTRIBUTORS.md`; defaults to `none`
- `include-automation-contributors`: optional `true` or `false`; defaults through config to `true`
  and controls derived contributor displays without changing the ledger
- `comment-mode`: optional `none` or `upsert`, default `none`; `upsert` creates or updates one
  Clarissimi-managed status comment on the merged source pull request after a proposal succeeds
- `base-branch`: defaults to `main`
- `remote-name`: defaults to `origin`
- `staging-dir`: optional temporary staging directory
- `summary-path`: optional workspace-relative path for a sanitized JSON summary artifact
- `provider`: optional provider override; omitted values fall back to config, then the runner fake
  default
- `provider-model`: provider model required for `openai-compatible`
- `provider-endpoint`: optional OpenAI-compatible endpoint
- `provider-endpoint-trust`: `public` or `private-network`, default `public`; private-network is an
  explicit opt-in for a trusted self-hosted endpoint; public mode validates all DNS answers, pins
  the connection, and does not follow redirects
- `provider-thinking`: optional OpenAI-compatible thinking mode, currently only `disabled`
- `draft-path`: approved draft inbox path required by `promote-draft`

The composite Action executes `action-dist/index.js`. Consumer runs must not install repository
dependencies or compile workspace TypeScript. The tracked bundle is derived from the Action source
and must match `pnpm run bundle:action:check` before merge or release. The composite launcher uses
Bash. Ubuntu, macOS, and Windows are claimed consumer runners after external dry-run and full-write
smoke passed for immutable tag `v0.1.1`.

ADR 0034 permits moving major alias `v0` only when it resolves to the exact commit of a validated
immutable `v0.x.y` release. Immutable version tags never move. Consumers that need deterministic
dependency review should pin the immutable patch tag or commit SHA instead of the major alias.

ADR 0055 defines the stable `v1` line. The release tools derive alias `v1` from an immutable
`v1.x.y` tag, require a non-draft and non-prerelease GitHub Release, and reuse the exact-SHA,
compare-and-swap, external consumer, cleanup, and rollback boundaries of `v0`. The stable Action
major is independent from the persisted `clarissimi.assessment/v1` schema identifier.

The future expanded action contract should include:

- pull request number or event-derived target
- minimum confidence threshold

Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.
Public provider endpoints require credential-free HTTPS and reject local, private, and reserved
literal destinations. URL credentials are forbidden in every endpoint trust mode. DNS resolution
and connection pinning remain outside the current provider transport boundary.
Required merged pull request event fields are parsed through the same runtime fixture validator
before evidence collection, so malformed numbers, titles, actor ids, and actor logins fail with
field-specific diagnostics instead of unchecked runtime errors.
GitHub API base URLs must use HTTPS and must not include URL credentials, a query, or a fragment.
Arbitrary HTTPS GitHub Enterprise Server hosts and API paths remain supported.

Action mode validation is owned inside `packages/action`. Unsupported `INPUT_MODE` values must fail
as usage errors before collection, provider, staging, branch, or pull request work begins.

`config-path` is explicit and optional. The Action does not automatically discover repository config
files. When set, the path is resolved relative to `GITHUB_WORKSPACE` unless it is absolute, loaded,
and validated through `packages/schemas`. Action inputs and workflow environment values take
precedence over config values. Omitted provider inputs fall back to config values, then the runner's
fake provider default. Unsupported `INPUT_MODE` values fail before config-file loading.

`markdown-summary` controls presentation only. `table` adds deterministic counts and `gallery` adds
stable-id GitHub avatar links before the existing evidence-linked detailed sections. An explicit
Action input overrides config `markdownSummary`; omitted values fall back to config, then `none`.
`include-automation-contributors` overrides config `includeAutomationContributors`; omitted values
fall back to config, then `true`. `false` preserves approved ledger records while excluding bot and
AI-agent identities from contributor Markdown, contributor JSON, and static display JSON.
Promote-draft does not load config, but it accepts the explicit presentation input.

`summary-path` is explicit and optional. When set, it must be a relative path that stays inside
`GITHUB_WORKSPACE`. The Action writes the same sanitized JSON summary that it prints to stdout and
emits the resolved path through `summary-json-path`. Invalid summary paths fail before provider
calls or write-mode mutation. Existing path components must not be symbolic links, junctions, or
hard-linked files, and their resolved paths must remain inside the workspace.

`comment-mode` is explicit and does not load from repository config. `upsert` is limited to
`propose`, `stage-draft`, and `promote-draft`; dry-run and direct commit reject it before repository
mutation. A managed comment must carry the versioned Clarissimi marker and be owned by
`github-actions[bot]` through the `github-actions` app. Clarissimi scans at most 1,000 comments,
fails closed on an incomplete scan or duplicate managed comments, and never overwrites marker text
owned by a user or another app. Comment content is a bounded proposal pointer, not recognition
output. The existing `pull-requests: write` permission covers list, create, and update operations;
`issues: write` is not required.

Dry-run mode reads provider credentials only when `provider` is explicitly set to
`openai-compatible`. The default provider is `fake`. The default Action mode is `propose`, which
reads `GITHUB_TOKEN` for live GitHub collection and proposal pull request creation or update.
Fixture-first `propose` succeeds only when the fixture explicitly carries an approved or
auto-approved maintainer approval status. Normal provider drafts remain non-public and fail closed
before branch mutation. Before rendering, propose mode parses the checked-out
`.clarissimi/contributions.jsonl` when present, rejects malformed or duplicate existing records,
and appends the new contribution identity. It rebuilds all derived outputs from that complete
ledger; it must never replace prior recognition history with only the new assessment.

`commit` uses the same assessment and complete-ledger contract as `propose`, but writes the staged
outputs directly to `INPUT_BASE_BRANCH`. It requires a clean checkout, checks HEAD against
`GITHUB_SHA` when present, creates a bot-authored commit only when outputs changed, and pushes with
normal fast-forward semantics. Dirty worktrees, stale expected HEAD, concurrent target updates,
branch protection rejection, unsafe paths, and non-approved assessments fail closed. It never
force-pushes or opens a pull request.

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

Proposal updates use an explicit force-with-lease expectation derived from the remote branch SHA
observed immediately before publication. This works on fresh runners without local remote-tracking
state while still rejecting a concurrent remote branch update.

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

An OpenAI-compatible `invalid_assessment` failure with structured issues appends a separate bounded
section to `GITHUB_STEP_SUMMARY`. The section contains at most eight validator rule codes and JSON
paths. It excludes issue messages and every raw provider, prompt, evidence, pull request, patch, and
secret value. Failure-summary write errors do not replace the original provider failure.

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
- `source-comment-action` when `comment-mode` is `upsert`
- `source-comment-url` when `comment-mode` is `upsert`
- `summary-json-path` when `summary-path` is set

In `commit` mode, the Action also emits:

- `staged-file-count`
- `direct-commit-branch`
- `direct-commit-sha`
- `direct-commit-created`
- `direct-commit-pushed`
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
- Missing `GITHUB_TOKEN` in `commit` mode: exit `1`, empty stdout, usage message on stderr.
- Dirty checkout or stale `GITHUB_SHA` in `commit` mode: exit `4`, empty stdout, diagnostic on
  stderr before repository output mutation.
- Concurrent update or branch protection rejection in `commit` mode: exit `4`, empty stdout,
  diagnostic on stderr; no force push is attempted.
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
the minimum write permissions required to create a proposal branch and pull request. Commit mode
needs `contents: write` and no pull-request write permission.

## Review Blockers

Block changes that introduce any of these conditions:

- Default behavior requires broad write permissions.
- Provider secrets are modeled as plain action inputs.
- The Action runs untrusted PR head code.
- Public outputs include raw evidence or raw provider output.
- `stage-draft` mode writes public recognition outputs or implies maintainer approval.
