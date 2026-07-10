# ADR 0031: First Public Action Release

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi has a working root composite Action, local and hosted validation, write-mode dogfood,
and credentialed live-provider smoke evidence. The previous release policy intentionally blocked
all versioned Action tags until maintainers selected the first public distribution boundary.

Publishing every workspace package at the same time would add package versioning, provenance,
registry authentication, and package rollback decisions that the Action does not need. The root
Action can instead be distributed directly from an immutable Git tag while workspace packages
remain private implementation details.

## Decision

The first public distribution is the root GitHub Action at immutable tag `v0.1.0`.

- The tag must point to the exact candidate commit covered by passed local gates, hosted CI, and
  hosted live-provider smoke evidence.
- The corresponding GitHub Release is marked as a pre-release and links to the external release
  evidence issue.
- Consumer examples use `0disoft/clarissimi@v0.1.0` instead of the moving `main` branch.
- No moving `v0` alias is created for the first release.
- Root and workspace package manifests remain private at `0.0.0`.
- npm publication, package version changes, and GitHub Marketplace publication remain blocked until
  a separate accepted release decision defines package or marketplace policy.

The `v0.1.0` tag is immutable after publication. A normal defect is corrected with a new patch tag,
starting with `v0.1.1`, rather than moving the existing tag. Tag deletion or replacement is reserved
for an urgent security or supply-chain incident and requires a public incident or release issue that
records the old SHA, replacement SHA, affected users, and recovery instructions.

## Consequences

Repositories can pin the Action to a reviewable version without depending on npm publication. The
Action continues to build its private workspace packages from the tagged source at runtime.

The first release does not claim package stability, Marketplace availability, a stable `1.x`
support policy, or compatibility for direct imports from workspace packages.

## Validation

- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- hosted CI for the exact tag target SHA
- hosted live-provider smoke for the exact tag target SHA
- external release evidence issue linked from the GitHub Release
