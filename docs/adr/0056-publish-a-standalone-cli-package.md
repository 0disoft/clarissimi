# ADR 0056: Publish a Standalone CLI Package

- Status: Accepted
- Date: 2026-07-18
- Owner: Repository maintainers

## Context

The CLI currently imports five private workspace packages. Publishing `packages/cli` as-is would
therefore force Clarissimi to publish and independently support most of the monorepo even though
users need only one executable. It would also expose internal package boundaries as public npm
contracts and multiply version, provenance, dependency, and rollback work.

The root GitHub Action, the standalone CLI, workspace packages, and persisted assessment schemas
have different compatibility boundaries. Giving them one shared version would suggest guarantees
that the repository does not actually make.

## Decision

Clarissimi accepts a public, dependency-free npm distribution named `clarissimi`, beginning with
version `0.1.0`. At acceptance time this ADR authorized the distribution contract and release
preparation without claiming package-name availability, registry ownership, or completed
publication. Current implementation status is recorded below without changing that decision.

- `distribution/npm/clarissimi/package.json` is the source manifest. Root and `packages/*`
  manifests remain private at `0.0.0` and are not npm publication surfaces.
- `scripts/build-standalone-cli-package.mjs` bundles the compiled CLI and all internal runtime code
  into one Node.js 24 ESM executable. The staged package has no runtime dependencies, lifecycle
  scripts, source files, tests, source maps, or workspace metadata.
- Generated package contents live only under ignored `.tmp/npm/clarissimi`. They are rebuilt from
  the source manifest, package README, root license, compiled CLI, and pinned esbuild version.
- `scripts/verify-standalone-cli-package.mjs` checks the manifest and exact tarball file set,
  installs the tarball with scripts disabled into an isolated temporary consumer, and runs the
  installed CLI help contract.
- npm package versions, Action release versions, and persisted schema versions are independent.
  `clarissimi@0.1.0`, root Action `v1.0.0`, and `clarissimi.assessment/v1` do not imply matching
  release cadence or compatibility promises.
- Package name ownership and exact version availability must be rechecked immediately before the
  first publication. npm versions are immutable and never reused; a defective release is followed
  by a new version and may be deprecated, not overwritten.
- The first publication is a maintainer-operated bootstrap. It runs locally with npm two-factor
  authentication. Because npm provenance is available only on supported cloud-hosted CI runners,
  this one bootstrap version is published without provenance. No long-lived npm token is committed
  or added merely to automate that bootstrap.
- After the package exists, npm trusted publishing is configured for the repository workflow with
  stage-only permission. `.github/workflows/npm-publish.yml` submits a staged package only from a
  GitHub-hosted runner using OIDC, `id-token: write`, Node.js 24, npm 11.15.0 or newer, an exact
  commit SHA, and a protected `npm` environment. The workflow contains no token fallback and has no
  direct-publish permission.
- A staged version is not public until a maintainer inspects it and approves it with two-factor
  authentication. Rejection and approval remain interactive npm operations, not agent commands.
- Actual publication remains manual-only. Local agents may build and verify the package but may not
  publish it through a general command intent.

## Consequences

Consumers get one normal CLI package while internal module boundaries stay private. The tarball is
larger than a thin workspace package, but it avoids registry dependency chains and makes a clean
consumer test possible without contacting npm for Clarissimi runtime dependencies.

The first release established registry ownership, used maintainer authentication, configured
stage-only trusted publishing, and verified the public install. The bootstrap version has no
provenance attestation; subsequent releases add CI-generated provenance plus a proof-of-presence
review between staging and public availability. If publication fails after a version is accepted by
npm, recovery uses a new version. Deleting or republishing the same version is not a rollback plan.

## Implementation Status

As of 2026-07-21, `clarissimi@0.1.0` is public on npm. Its registry integrity and shasum matched the
maintainer publish output, and an isolated external consumer passed installation, executable help,
and a fixture-backed dry-run. Trusted publishing permits only `npm stage publish` from
`0disoft/clarissimi`, workflow `npm-publish.yml`, environment `npm`. The package publishing-access
setting retains the maintainer-selected bypass-2FA granular-token fallback; the repository workflow
itself has no token fallback or direct-publish permission. Source version `0.1.1` corrects the
immutable bootstrap package README and is the first candidate for the staged OIDC path.

## Validation

- `pnpm run verify:cli-package`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- a post-publication install in an external empty repository before claiming availability
