# Output and Exit Codes

- Status: Draft
- Repository Type: cli-tool

## Output Principles

Clarissimi output must help maintainers review what happened without leaking raw evidence or
provider internals.

Human output should summarize:

- event or fixture processed
- fixture kind
- drafts created
- entries skipped
- redaction warnings
- schema validation failures
- files that would change or did change

JSON output should be stable enough for CI and must not include:

- raw provider response
- raw diff
- raw issue or PR body
- raw patch excerpt
- secrets or redacted source text
- private environment values

When the exact boolean `--json` flag is present, both success and failure write one JSON document to
stdout and leave stderr empty. Failure documents contain `ok: false`, the command name, and a
sanitized `message`; the process exit code remains the authoritative failure category. This also
applies to argument parsing and usage errors. Without `--json`, failures remain human-readable on
stderr.
When provider assessment validation fails, JSON may add bounded `issueCodes` from Clarissimi's
validators. These codes identify failed rules without exposing provider text or evidence.

`clarissimi completion <shell>` is the deliberate exception to JSON success output: stdout is the
generated shell program, and `--json` is rejected as an unsupported option. The program is static,
uses LF line endings, ends with a newline, and contains no repository, environment, or credential
data. If the unsupported `--json` flag is present, the usage failure still follows the global JSON
failure contract above; it never wraps a successful completion script in JSON.

`clarissimi render-page --json` reports `ledgerPath`, `outputDirectory`, `pagePath`, and the single
`index.html` file name. It does not include the generated HTML in command output.
`clarissimi rebuild --check --json` adds `checked: true` and `checkedFiles` with the compared path
names; existing rebuild output fields retain their meanings.

## Exit Codes

- `0`: success
- `1`: usage error
- `2`: invalid configuration
- `3`: invalid ledger
- `4`: provider or fixture recognition failure
- `5`: provider schema validation failure
- `6`: policy rejection
- `7`: write failure
- `8`: derived output drift found by `rebuild --check`; no output files were replaced

## Review Blockers

- Output implies a recognition entry was approved when it is only a draft.
- Output calls a contributor high, medium, or low quality.
- JSON output leaks raw evidence.
- Exit behavior changes without CLI tests.
