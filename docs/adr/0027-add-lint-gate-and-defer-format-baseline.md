# ADR 0027: Add Lint Gate And Defer Format Baseline

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

Clarissimi needs a real `lint` validation before public release work continues. The repository has
TypeScript packages, Node.js scripts, GitHub Action workflows, and many Markdown source-of-truth
documents. A fast lint gate can catch unused code, unsafe patterns, and drift without rewriting the
repository.

The stable validation name `format` still exists, but turning it on now is not a small mechanical
change. A current Prettier check reports formatting drift across 82 existing files. Enabling a
repo-wide formatter by immediately rewriting those files would bury functional and contract changes
under style churn and make future review harder.

`oxfmt` is not selected as the repository formatter because it is still a 0.x package and is focused
on JavaScript-family formatting rather than the full Markdown, YAML, JSON, and TypeScript surface
owned by this repository.

Formatter revalidation on 2026-07-10 kept this decision in place:

- `npm view oxfmt version description license repository --json` reported `oxfmt@0.58.0`,
  "Formatter for the JavaScript Oxidation Compiler", MIT license, and the `oxc` repository.
- `pnpm dlx oxfmt@0.58.0 --check packages scripts action.yml .github --ignore-path=.gitignore
--no-error-on-unmatched-pattern` reported format issues in 78 JavaScript-family package and script
  files.
- `pnpm dlx prettier@3.9.5 --check "**/*.{md,json,yml,yaml,ts,mjs}" --ignore-path .gitignore`
  reported style drift in 82 files across Markdown, JSON, YAML, TypeScript, and script surfaces.

This means enabling `format` is still a dedicated formatter-baseline rewrite, not a small validation
toggle. `oxfmt` remains useful to watch, but it cannot represent the repository-wide formatter
contract by itself.

## Decision

Use `oxlint` as the first real lint gate.

The `lint` command must:

- run `oxlint . --deny-warnings`
- fail on warnings
- run in hosted CI as its own validation step
- be covered by `release-readiness` contract checks so the package script and CI workflow cannot
  silently drift back to placeholders

Keep `format` intentionally unconfigured for now. The placeholder must continue to fail instead of
pretending formatting is enforced.

A future formatter-baseline change may enable `format`, but it must be isolated from feature work
and should:

- choose a formatter that covers the repository file types it claims to own
- include the formatter config, ignore rules, and lockfile change in the same commit
- run the formatter across the selected baseline once
- avoid mixing baseline style rewrites with product, schema, provider, or Action behavior changes
- update `docs/ops/ci.md`, `README.md`, `docs/product/04-implementation-tracker.md`, and
  `release-readiness` when the `format` validation becomes real

## Consequences

Clarissimi gets a fast, low-noise lint gate without a broad formatter rewrite. CI now catches
lint warnings as failures, while the repository avoids accidental review noise from 82 unrelated
format-only file rewrites.

`format` remains a known gap, not a fake success. Final validation reports should continue to list
`format` as skipped or intentionally unconfigured until a formatter-baseline ADR or equivalent
source-of-truth update accepts the rewrite.

## Validation

- `pnpm run lint`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
