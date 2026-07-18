# ADR 0055: Define the Stable v1 Action Compatibility Boundary

- Status: Accepted
- Date: 2026-07-18
- Owner: Repository maintainers

## Context

Clarissimi has a validated `v0` Action release line, a moving `v0` alias, a Marketplace listing,
and a manifest-backed migration compatibility gate. The repository still lacks one decision that
separates a stable Action promise from unrelated npm package publication and from the independently
versioned persisted assessment schema.

Coupling the first stable Action release to every workspace package would delay a useful stable
consumer contract and create registry, provenance, dependency, and rollback obligations that the
root Action does not need. Renaming `clarissimi.assessment/v1` merely because the Action becomes
`v1.0.0` would also manufacture a data migration without changing the data shape.

## Decision

Clarissimi selects `v1.0.0` as the first stable root GitHub Action release candidate, subject to
the release gates below. This ADR defines the compatibility boundary; it does not create a tag,
move an alias, publish a package, or claim that current external validation has passed.

The stable contract is:

- The root GitHub Action is the only artifact covered by the `v1` release line. Root and workspace
  npm packages remain private at `0.0.0` until a separate package-publication decision is accepted.
- Action release versions and persisted schema versions are independent namespaces.
  `clarissimi.assessment/v1` remains the current ledger record schema for `v1.0.0`; no data
  migration is created without a real schema change.
- Every persisted assessment version registered in `fixtures/migrations/manifest.json` when
  `v1.0.0` is released must remain readable and deterministically migratable throughout the `v1`
  Action line.
- A `v1.x.y` release may add optional inputs, outputs, modes, or schema fields, but it must not
  remove or rename an existing Action input or output, make an optional input required, increase
  the default write authority, make a previously valid registered ledger invalid, or weaken
  redaction, maintainer approval, path ownership, and compare-and-swap protections.
- A change that breaks those guarantees requires a new Action major version. An urgent security or
  supply-chain exception also requires an incident record, an immutable corrective release, and
  explicit migration or consumer recovery instructions.
- Immutable `v1.x.y` tags never move. Moving alias `v1` may point only to one already-published,
  non-draft, non-prerelease immutable `v1.x.y` release at the same verified commit.
- Creating or moving `v1` uses the same compare-and-swap, exact-SHA, post-promotion verification,
  external dry-run, external full-write, cleanup, and rollback boundaries accepted for `v0` by
  ADR 0034.
- Existing immutable `v0.x.y` tags and alias `v0` are not deleted or repointed as part of the v1
  release. After `v1.0.0`, any new v0 release needs a separate explicit decision; this ADR promises
  no fixed v0 support duration.

`v1.0.0` publication remains blocked until the parameterized release, Marketplace, release-result,
and major-alias tools accept the `v1` line without weakening their current fail-closed checks. The
exact candidate must then pass local validation, hosted CI, hosted live-provider smoke, external
consumer dry-run and full-write smoke, post-tag smoke, Marketplace verification, and the separate
`v1` alias promotion checks.

## Consequences

Action consumers get a stable major contract without waiting for npm publication. Existing ledger
history keeps its actual schema identity and remains protected by the migration manifest. The v1
release cannot happen accidentally: accepting this decision is only the first gate, and current
v0-only release tooling must be generalized and regression-tested before any v1 tag exists.

Rollback never moves or deletes an immutable version tag. If first-time `v1` alias verification
fails, delete only the newly created alias with a compare-and-swap lease; if a later promotion
fails, restore the previously recorded alias SHA. Leave `v0`, its immutable tags, and persisted
ledger data unchanged.

## Validation

- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run migration-check`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- parameterized release-tool regression tests for both `v0` and `v1`
- exact-SHA hosted CI and live-provider smoke for the final `v1.0.0` candidate
- external dry-run and full-write smoke for the candidate SHA, immutable `v1.0.0`, and moving `v1`
- Marketplace verification for immutable `v1.0.0`
