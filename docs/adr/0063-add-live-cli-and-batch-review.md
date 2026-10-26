# ADR 0063: Add Live CLI Collection and Batch Review

- Status: Accepted
- Date: 2026-10-26
- Owner: Repository maintainers

## Decision

The CLI may route `recognize --pr <GitHub PR URL>` or `recognize --repo <owner/name> --prs
<comma-separated numbers>` through the existing injected GitHub client and shared provider
preparation. At most 25 explicitly selected merged PRs are collected per invocation. GitHub token
loading belongs to the CLI (`GITHUB_TOKEN`, then `GH_TOKEN`); it is never a command-line argument
or output. The default remains `dry-run`; `--mode stage-draft` explicitly saves review drafts with
exclusive creation. Existing fixture commands and JSON fields remain compatible.

Large PRs remain rejected by default. `--allow-partial` explicitly permits bounded file collection,
and collection coverage and possible omissions must be reported to the maintainer and provider.
No repository checkout, untrusted code execution, remote write, or automatic approval is added.

`review-drafts --drafts-dir <path> --review <file>` saves a sanitized, bounded review manifest for
up to 25 staged drafts. Each entry includes its reviewed assessment and core-generated content
hash. `review-drafts --review <file> --approve --out-dir <path>` is the explicit maintainer decision:
it verifies each current draft against that hash, records approval snapshots, and imports the
whole selected batch under existing ledger/output locks with one rendering pass and atomic file
replacement. Invalid, changed, duplicate, unsafe, or conflicting inputs reject the whole import.
The manifest itself cannot silently substitute edited prose; changed drafts need a fresh review.

The CLI owns selection and file I/O. Core owns hashes and approval; renderers own sanitized
records, uniqueness, and output content. Existing Action permission/SHA gates remain in place.

## Consequences

N selected drafts need one review decision and one ledger/output rendering pass instead of N
separate approval/import commands and N rendering passes. Local batch approval is an explicit
maintainer operation, like the existing local `approve-draft`; it does not authenticate a GitHub
actor or remove GitHub review requirements. Writes retain the existing process-failure rollback
limits and are not claimed to be power-loss transactions.
