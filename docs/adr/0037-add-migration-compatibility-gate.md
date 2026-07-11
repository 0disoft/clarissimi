# ADR 0037: Add Migration Compatibility Gate

- Status: Accepted
- Date: 2026-07-11
- Owner: Repository maintainers

## Context

`migration-check` has intentionally failed closed because Clarissimi has not performed a persisted
ledger migration. Leaving the placeholder indefinitely means the stable validation name proves
nothing, while replacing it with a command that merely reports "no migrations" would create a fake
success.

The current persisted source of truth is a single `.clarissimi/contributions.jsonl` file whose
records use `clarissimi.assessment/v1`. ADR 0022 requires explicit schema versions, deterministic
rebuilds, duplicate detection, and a migration check before the accepted ledger shape changes.
Risk R9 also requires migration coverage before stable 1.0.

## Decision

Replace the placeholder with a manifest-backed compatibility gate.

`fixtures/migrations/manifest.json` must declare:

- the current assessment schema version
- every known persisted assessment version in oldest-to-newest order
- one accepted compatibility fixture per known version
- an explicit migration edge and repository-local migration module between every adjacent version
- one rejected fixture carrying an unregistered future version

For the current v1-only ledger, zero migration edges is correct. Adding another known version
without an adjacent migration edge, executable migration module, and compatibility fixture must
fail.

`pnpm run migration-check` must build the schema package, execute every historical fixture through
each adjacent migration module, require deterministic results from repeated execution, validate the
final value against the current assessment schema, accept the committed v1 fixture, reject the
unknown-version fixture at `$.schemaVersion`, and run as its own hosted CI step.
`release-readiness` must protect the package script, checker, manifest, tests, and hosted workflow
registration.

Migration module paths and their resolved filesystem targets must remain inside the repository.
Invalid or escaping paths fail before module loading.

The gate validates compatibility evidence; it does not rewrite ledgers, invent a v2 schema, create
partitions, or claim that a migration has already occurred.

## Consequences

The last intentionally fail-closed stable validation becomes executable without pretending that
Clarissimi has a migration. Future persisted schema changes must carry explicit evidence in the
same change.

Rollback is code-only. No database, API, package publication, provider, permission, or release
channel changes.

## Validation

- `pnpm run migration-check`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
