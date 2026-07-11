# ADR 0035: Adopt Prettier Format Baseline

- Status: Accepted
- Date: 2026-07-11
- Owner: Repository maintainers

## Context

ADR 0027 intentionally deferred `format` because enabling it required an isolated repository-wide
rewrite. That isolation now exists: this change contains formatting infrastructure, the one-time
baseline rewrite, and synchronized validation contracts without product, schema, provider, or
GitHub Action behavior changes.

Clarissimi owns TypeScript and JavaScript implementation files plus JSON, Markdown, and YAML
contracts. Prettier 3.9.5 officially supports all of those formats, is a stable major release, and
documents a local exact-version install, a root `.prettierignore`, and `prettier . --check` for CI.

The alternatives do not cover this contract as cleanly. `oxfmt@0.58.0` remains a 0.x formatter for
the JavaScript Oxidation Compiler and does not own the full Markdown and YAML surface. Biome would
overlap with the accepted Oxlint role while adding a second lint-capable toolchain without reducing
the formatter contract.

## Decision

Adopt exactly pinned `prettier@3.9.5` as the repository formatter.

The `format` validation must:

- run `prettier . --check`
- cover maintained TypeScript, JavaScript, JSON, Markdown, and YAML files
- use `.prettierrc.json` so CLI and editor integrations share the same options
- use `.prettierignore` to exclude `action-dist/` and build, coverage, dependency, cache, and
  temporary output
- run in hosted CI as its own validation step
- be protected by `release-readiness` checks for the package script, exact dependency version,
  configuration, ignore rules, and workflow registration

The committed baseline is produced once with the same pinned local formatter. Future changes must
pass check mode; CI must never rewrite source files.

## Consequences

Formatting becomes a real merge gate instead of an intentionally failing placeholder. The initial
commit is large by design but contains no product behavior change. Generated `action-dist/index.js`
remains outside the formatter surface because bundle freshness is already checked byte-for-byte by
`bundle:action:check`. The baseline still regenerates that tracked bundle once because formatting
its TypeScript sources changes the deterministic bundle bytes; Prettier does not format the bundle
directly.

Rollback is code-only: revert this isolated commit to restore the ADR 0027 fail-closed state. No
runtime package, public API, persisted data, provider, credential, or release channel changes.

## Validation

- `pnpm run format`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
