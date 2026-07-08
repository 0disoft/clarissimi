# Output and Exit Codes

- Status: Draft
- Repository Type: cli-tool

## Output Principles

Clarissimi output must help maintainers review what happened without leaking raw evidence or
provider internals.

Human output should summarize:

- event or fixture processed
- drafts created
- entries skipped
- redaction warnings
- schema validation failures
- files that would change or did change

JSON output should be stable enough for CI and must not include:

- raw provider response
- raw diff
- raw issue or PR body
- secrets or redacted source text
- private environment values

## Exit Codes

- `0`: success
- `1`: usage error
- `2`: invalid configuration
- `3`: invalid ledger
- `4`: provider or fixture recognition failure
- `5`: provider schema validation failure
- `6`: policy rejection
- `7`: write failure

## Review Blockers

- Output implies a recognition entry was approved when it is only a draft.
- Output calls a contributor high, medium, or low quality.
- JSON output leaks raw evidence.
- Exit behavior changes without CLI tests.
