# ADR 0014: Add Fixture-First CLI Package

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi has schema, redaction, core policy, fake provider, and renderer packages. The next MVP
step is a local CLI that proves the recognition flow without live GitHub API access, live LLM API
calls, or GitHub Action permissions.

The product specification names these MVP commands:

- `clarissimi validate-config`
- `clarissimi validate-ledger`
- `clarissimi recognize --fixture <path> --mode dry-run`
- `clarissimi rebuild`

## Decision

Implement `packages/cli` as a fixture-first local command package.

The package owns:

- command parsing and local CLI I/O
- stable initial exit codes
- config validation for `.clarissimi/config.json`
- ledger validation through renderer parsing
- fixture recognition orchestration through core, fake provider, and renderers
- rebuild orchestration from ledger text to derived output content

The package must not own:

- schema vocabulary
- redaction policy
- provider model behavior
- maintainer approval policy
- GitHub API collection
- GitHub Action runtime behavior

The first implementation supports only fake-provider fixture recognition and only `--mode dry-run`
for `recognize`. `rebuild` returns a preview by default and writes files only when an explicit
`--out-dir` is provided.

## Exit Codes

- `0`: success
- `1`: usage error
- `2`: invalid config
- `3`: invalid ledger
- `4`: provider or fixture recognition failure
- `5`: provider schema validation failure
- `6`: policy rejection
- `7`: write failure

## Consequences

The CLI can be smoke-tested locally without secrets, network access, or untrusted PR code
execution.

`clarissimi.config.ts` support remains deferred because loading TypeScript config safely requires a
separate loader decision. The fixture-first CLI validates `.clarissimi/config.json`.

Future GitHub collection, live provider adapters, and Action entrypoints should call the same
package boundaries instead of duplicating policy or rendering logic.

## Review Blockers

- CLI recognition writes public outputs without explicit mode or approval.
- CLI sends provider input before redaction.
- CLI adds live provider credentials, tokens, or real-looking secret examples.
- CLI duplicates schema vocabulary or approval policy instead of importing existing packages.
