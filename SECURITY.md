# Security Policy

## Project Boundary

Clarissimi is designed to process public repository evidence and produce maintainer-reviewed
contribution recognition records.

Security-sensitive areas include:

- GitHub Action permissions and event triggers
- redaction before provider calls
- LLM provider input and output handling
- generated recognition files
- `.clarissimi` ledger and derived outputs
- examples, fixtures, logs, and CLI output

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories for this
repository when available.

If GitHub Security Advisories are not available, do not open a public issue with exploit details,
tokens, private keys, private repository content, or sensitive security evidence. Open a minimal
public issue that asks maintainers to enable a private reporting channel, without including the
sensitive details.

## What to Include

Include enough information for maintainers to reproduce and triage the issue safely:

- affected version, commit, or branch
- affected command, Action mode, or package boundary
- expected behavior
- observed behavior
- minimal reproduction steps
- whether sensitive data, provider input, generated output, or GitHub token permissions are involved

Do not include live secrets, personal data, private repository content, or full exploit payloads in
public channels.

## Security Design Commitments

Clarissimi should preserve these commitments:

- AI drafts recognition; maintainers or explicit policy approve publication.
- Redaction happens before any external provider call.
- Provider raw responses are not logged by default.
- Public output avoids raw diffs, raw issue text, secrets, private keys, and email addresses.
- GitHub Action dry-run mode uses read-only permissions.
- GitHub Action propose mode uses the narrowest write permissions needed to open a reviewable pull
  request.
- `pull_request_target` is not the default workflow path.
- Untrusted pull request head code is not checked out or executed by default.

## Out of Scope for Public Reports

Do not publicly disclose:

- tokens, credentials, private keys, or secret values
- private repository content
- non-public vulnerability details from another project
- provider raw responses that include sensitive data
- exploit instructions that enable immediate abuse

## Supported Versions

Clarissimi is pre-1.0. Security fixes are supported for the current immutable Action release
`v0.5.0` and the moving `v0` release line. Fixes land on the default branch, ship in a new immutable
`v0.x.y` release after release validation, and reach `v0` only after that release passes the alias
promotion gates. Older immutable tags do not receive routine backports.

Stable supported-version policy must be documented before a `1.0.0` release.
