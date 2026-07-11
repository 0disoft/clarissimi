# ADR 0036: Replace Prettier With Oxfmt

- Status: Accepted
- Date: 2026-07-11
- Owner: Repository maintainers
- Supersedes: ADR 0035

## Context

ADR 0035 selected Prettier after incorrectly treating Oxfmt as a JavaScript-family-only formatter.
That comparison relied on stale ADR 0027 evidence and the short npm package description instead of
the current Oxfmt language-support contract.

The current Oxfmt documentation explicitly lists JavaScript, TypeScript, JSON, YAML, Markdown, and
the other maintained formats Clarissimi needs. It also provides a Prettier-compatible workflow,
uses `oxfmt --check` for non-writing CI validation, recommends `.oxfmtrc.json` `ignorePatterns` for
new projects, respects repository Git ignore rules, and ignores lockfiles by default.

Keeping Prettier would add a second formatting ecosystem beside the already accepted Oxlint
toolchain without providing required format coverage that Oxfmt lacks. The formatter surface is a
reversible build-pipeline choice, not a runtime, public API, data, credential, or release-channel
dependency.

## Decision

Replace Prettier with exactly pinned `oxfmt@0.58.0`.

The `format` validation must:

- run `oxfmt --check`
- cover maintained TypeScript, JavaScript, JSON, Markdown, and YAML files
- use `.oxfmtrc.json` for shared CLI and editor options
- keep `endOfLine: "lf"` and `proseWrap: "preserve"`
- use `ignorePatterns` to exclude `action-dist/**` and build, coverage, cache, and temporary output
- run in hosted CI as its own non-writing validation step
- be protected by `release-readiness` checks for the exact dependency, configuration, ignore
  patterns, and workflow registration

The baseline is written once with the pinned local Oxfmt executable. Future changes must pass
check mode. CI must never rewrite source files.

## Consequences

Clarissimi uses Oxlint for linting and Oxfmt for repository formatting. Prettier and its
configuration files are removed. Oxfmt always ignores the pnpm lockfile while pnpm remains the
authority that updates it for dependency changes.

The tracked `action-dist/index.js` remains outside the formatter surface. If source reformatting
changes deterministic bundle bytes, `bundle:action` regenerates it and `bundle:action:check`
continues to enforce freshness.

Rollback is code-only: revert this isolated change to restore the pinned Prettier baseline from
ADR 0035. No product behavior, schema, provider, permission, persisted data, or package-publication
boundary changes.

## Validation

- `pnpm run format`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
