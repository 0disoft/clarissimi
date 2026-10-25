# ADR 0059: Refresh Development Toolchain

- Status: Accepted
- Date: 2026-08-10
- Owner: Repository maintainers
- Supersedes: the exact Oxfmt version snapshot in ADR 0036

## Context

Clarissimi had kept its root development tools on the versions last validated during earlier
release work. The repository maintainer prefers prompt adoption of stable fixes and explicitly
requested a latest-version refresh. TypeScript 7 is also a major compiler migration: it replaces
the JavaScript compiler implementation with the stable native compiler while aiming to preserve
TypeScript 6 type-checking and command-line behavior.

These packages are development-only, but they control type checking, emitted build output,
formatting, linting, Action bundling, and the standalone CLI package. They therefore need broad
contract verification instead of being treated as a lockfile-only update.

## Decision

Refresh the root development toolchain with `pnpm update --latest`.

The accepted snapshot is:

- `@types/node@26.6.5`
- `esbuild@0.28.2`
- `oxfmt@0.74.0`
- `oxlint@1.89.0`
- `typescript@7.0.2`

The 2026-10-26 refresh declares `@types/node@26.x`, `oxlint@1.x`, and `typescript@7.x`
so compatible stable releases can be selected without editing the manifest. Pre-1.0 tools
retain minor-version compatibility boundaries: `esbuild@^0.28.2` and `oxfmt@0.74.x`.
The pnpm lockfile records the exact reviewed versions; CI uses frozen installation.
The existing `pnpm@11.7.0` package manager remains unchanged; pnpm 12 is a separate migration.

The `format` validation must continue to:

- run `oxfmt --check`
- cover maintained TypeScript, JavaScript, JSON, Markdown, and YAML files
- use `.oxfmtrc.json` for shared CLI and editor options
- use `ignorePatterns` to exclude `action-dist/**` and generated output
- run in hosted CI as its own non-writing validation step
- be protected by `release-readiness` checks

Future changes must pass the complete TypeScript build and test suite.

CI must never rewrite source files.

The tracked `action-dist/index.js` remains outside the formatter surface and must stay byte-for-byte
reproducible through the Action bundle check.

The versions above are a reviewed snapshot, not a permanent ban on compatible updates. A future
maintainer-authorized refresh may replace the snapshot after the same dependency, build, package,
and generated-output checks pass. New major versions remain deliberate migrations.

Oxfmt 0.74.0 requires Tinypool 2.2.0 directly, so the previous `^2.1.2` security override
is no longer needed and has been removed. The lockfile must retain a version that includes
the fixes for GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr.

## Consequences

TypeScript now installs platform-specific native compiler packages. The lockfile grows to represent
those optional targets, while published Clarissimi runtime artifacts remain dependency-free.
Rollback is an isolated revert of the package manifest, pnpm lockfile, this ADR, and synchronized
release-readiness expectations.

No product API, persisted schema, provider behavior, GitHub permission, or database boundary
changes.

## Validation

- `pnpm run format`
- `pnpm run lint`
- `pnpm run check`
- `pnpm run bundle:action:check`
- `pnpm run verify:cli-package`
- `pnpm run docs`
- `pnpm run release-readiness`
