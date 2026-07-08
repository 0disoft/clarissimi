# Action Contract

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Action-first decision: `docs/adr/0005-action-first-no-saas.md`
- Propose-mode decision: `docs/adr/0008-propose-mode-default.md`

## Inputs

The exact `action.yml` contract is not implemented yet. The first action contract should include:

- config path
- mode: `dry-run`, `propose`, or `commit`
- provider selection
- provider model
- pull request number or event-derived target
- minimum confidence threshold

Secret values must be read from GitHub Actions secrets or environment variables, not action inputs.

## Outputs

The first action contract should expose:

- recognition draft count
- approved or proposed entry count
- skipped entry count
- output mode
- path to summary artifact or generated files when available

Outputs must not include raw provider responses, raw diffs, secrets, or sensitive security details.

## Permissions

Dry-run mode should need read permissions only. Propose mode needs the minimum write permissions
required to create a branch and pull request. Commit mode requires explicit configuration and should
not be the default.

## Review Blockers

- Default behavior requires broad write permissions.
- Provider secrets are modeled as plain action inputs.
- The Action runs untrusted PR head code.
- Public outputs include raw evidence or raw provider output.
