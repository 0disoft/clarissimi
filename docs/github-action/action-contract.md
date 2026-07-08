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

## Inputs

The Action supports dry-run summaries and a fixture-first `propose` write path. It accepts:

- `GITHUB_EVENT_PATH`: GitHub event payload path
- `INPUT_EVENT_PATH`: explicit event payload path override for tests and local runs
- `INPUT_GITHUB_FIXTURE`: explicit GitHub merged pull request fixture path
- `INPUT_MODE`: `dry-run` or `propose`
- `INPUT_BASE_BRANCH`: base branch for proposal pull requests, default `main`
- `INPUT_REMOTE_NAME`: remote name used to publish proposal branches, default `origin`
- `INPUT_STAGING_DIR`: optional temporary directory for generated proposal files
- `GITHUB_TOKEN`: token used only by `propose` mode to create or update the proposal pull request

The root `action.yml` exposes the same surface as a composite action:

- `mode`: defaults to `dry-run`
- `event-path`: optional event payload path override
- `github-fixture`: optional GitHub merged pull request fixture path
- `base-branch`: defaults to `main`
- `remote-name`: defaults to `origin`
- `staging-dir`: optional temporary staging directory

The future expanded action contract should include:

- config path
- mode: `commit`
- provider selection
- provider model
- pull request number or event-derived target
- minimum confidence threshold

Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.

Dry-run mode does not read provider API keys or GitHub tokens. The current `propose` mode reads
`GITHUB_TOKEN` for proposal pull request creation only; provider credentials are still not read.
Fixture-first `propose` succeeds only when the fixture explicitly carries an approved or
auto-approved maintainer approval status. Normal provider drafts remain non-public and fail closed
before branch mutation.

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

In `propose` mode, the Action also emits:

- `staged-file-count`
- `proposal-branch`
- `proposal-commit-sha`
- `proposal-pull-request-number`
- `proposal-pull-request-url`
- `proposal-pull-request-action`

When `GITHUB_STEP_SUMMARY` is available, the Action appends a bounded Markdown summary with the
same count and status fields. The step summary must not include raw pull request bodies, raw patch
excerpts, raw diffs, provider raw output, tokens, or secrets.

The future full action contract should also expose a path to a summary artifact when available.

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
- Draft, rejected, or skipped assessment in `propose` mode: exit `4`, empty stdout, diagnostic on
  stderr before branch mutation.

## Permissions

Dry-run mode should need read permissions only. Propose mode needs the minimum write permissions
required to create a proposal branch and pull request. Commit mode is not implemented.

## Review Blockers

- Default behavior requires broad write permissions.
- Provider secrets are modeled as plain action inputs.
- The Action runs untrusted PR head code.
- Public outputs include raw evidence or raw provider output.
