# ADR 0060: Add Cross-Platform Toolchain Smoke

- Status: Accepted
- Date: 2026-08-10
- Owner: Repository maintainers

## Context

ADR 0059 adopts TypeScript 7, Oxfmt, Oxlint, and esbuild versions that install platform-specific
native packages. Local Windows validation and the primary Linux CI job prove two environments, but
they do not prove that the locked macOS artifacts install and execute correctly.

Running a three-platform matrix for every source-only pull request would duplicate the primary CI
suite and consume runner capacity without improving most changes.

## Decision

Add `.github/workflows/toolchain-platform-smoke.yml` with read-only permissions and a Linux,
Windows, and macOS matrix on Node.js 24.

Each job must install the frozen pnpm lockfile and run the workspace build, Oxfmt check, Oxlint
check, and Action bundle freshness check. This exercises the native TypeScript compiler, formatter,
linter, and bundler without provider credentials or repository writes.

The workflow runs automatically only when `package.json`, `pnpm-lock.yaml`, or its own workflow file
changes on a pull request or `main`. Maintainers may also use `workflow_dispatch`. It is an
additional compatibility signal and is not a required branch-protection check.

## Consequences

Toolchain updates gain direct Linux, Windows, and macOS coverage without tripling ordinary CI cost.
A failed platform job blocks a toolchain upgrade decision but does not silently alter the existing
`Validation` branch-protection contract.

Rollback is code-only: revert the workflow, command registration, documentation, and validation
contract. No product API, persisted schema, provider credential, database, or publication boundary
changes.

## Validation

- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run check`
- `pnpm run hosted-toolchain-validation`
