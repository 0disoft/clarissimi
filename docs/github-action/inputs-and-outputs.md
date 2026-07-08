# Inputs and Outputs

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Action behavior: `docs/github-action/action-contract.md`
- Product behavior: `docs/product/02-spec.md`
- Default mode: `docs/adr/0008-propose-mode-default.md`

## Candidate Inputs

- `config-path`: path to `clarissimi.config.ts` or `.clarissimi/config.json`
- `mode`: `dry-run`, `propose`, or `commit`
- `provider`: provider adapter name
- `model`: provider model name
- `pull-request`: explicit pull request number when event resolution is not enough
- `min-confidence`: minimum draft confidence for policy consideration

Provider API keys and GitHub tokens are not plain inputs. They must come from secrets or the
workflow environment.

## Candidate Outputs

- `draft-count`
- `proposed-entry-count`
- `skipped-entry-count`
- `mode`
- `summary-path`

Outputs must not include raw provider output, raw diff text, raw issue text, tokens, private keys,
or sensitive security details.

## Review Blockers

- An input encourages hard-coded secrets.
- An output leaks raw evidence.
- Mode names drift from CLI mode names.
- Outputs imply public approval when the result is still only a draft.
