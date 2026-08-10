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

- `@types/node@26.2.0`
- `esbuild@0.28.2`
- `oxfmt@0.62.0`
- `oxlint@1.77.0`
- `typescript@7.0.2`

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
