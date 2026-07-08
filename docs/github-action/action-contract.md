# Action Contract

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Action-first decision: `docs/adr/0005-action-first-no-saas.md`
- Propose-mode decision: `docs/adr/0008-propose-mode-default.md`
- Dry-run skeleton decision: `docs/adr/0016-add-dry-run-action-skeleton.md`

## Inputs

The first package skeleton supports only dry-run local execution. It accepts:

- `GITHUB_EVENT_PATH`: GitHub event payload path
- `INPUT_EVENT_PATH`: explicit event payload path override for tests and local runs
- `INPUT_GITHUB_FIXTURE`: explicit GitHub merged pull request fixture path
- `INPUT_MODE`: only `dry-run`

The root `action.yml` exposes the same dry-run-only surface as a composite action:

- `mode`: defaults to `dry-run`
- `event-path`: optional event payload path override
- `github-fixture`: optional GitHub merged pull request fixture path

The future expanded action contract should include:

- config path
- mode: `dry-run`, `propose`, or `commit`
- provider selection
- provider model
- pull request number or event-derived target
- minimum confidence threshold

Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.

The dry-run skeleton does not read provider API keys or GitHub tokens.

## Outputs

The dry-run skeleton emits a bounded JSON summary with:

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

The future full action contract should also expose a path to a summary artifact or generated files
when available.

Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details.
The dry-run skeleton also omits raw pull request bodies and raw patch excerpts.

## Permissions

Dry-run mode should need read permissions only. Propose mode needs the minimum write permissions
required to create a branch and pull request. Commit mode requires explicit configuration and should
not be the default.

## Review Blockers

- Default behavior requires broad write permissions.
- Provider secrets are modeled as plain action inputs.
- The Action runs untrusted PR head code.
- Public outputs include raw evidence or raw provider output.
