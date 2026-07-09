# ADR 0028: Add Native TypeScript Config Loading

- Status: Accepted
- Date: 2026-07-10
- Owner: Repository maintainers

## Context

Clarissimi's product and CLI configuration docs name two supported config files:

- `clarissimi.config.ts`
- `.clarissimi/config.json`

The earlier fixture-first CLI only loaded `.clarissimi/config.json` because TypeScript config loading
needed an explicit loader decision. Adding a third-party loader would increase the dependency and
execution surface for a small CLI boundary. The repository already targets Node.js 24 in hosted CI,
and Node.js 24 can import TypeScript modules with native type stripping.

Config files are still untrusted repository input. They must not store provider tokens, GitHub
tokens, prompts, raw evidence, or private values.

## Decision

Support `clarissimi.config.ts` in the CLI without adding a new loader dependency.

The CLI config loader must:

- discover `clarissimi.config.ts` and `.clarissimi/config.json` by default
- fail closed when both default config files exist and require `--config <path>` to choose one
- accept explicit `--config <path>` for either supported config file
- require TypeScript config files to be named `clarissimi.config.ts`
- require TypeScript config files to export a default config object
- validate loaded config values through `packages/schemas`
- keep CLI flags higher precedence than config values
- keep provider tokens outside config files and command-line arguments

The CLI may execute `clarissimi.config.ts` as local repository configuration code. This is limited
to local CLI execution and must not bypass the existing provider-token, redaction, or schema
validation boundaries.

## Consequences

Maintainers can use a typed config file without installing a separate loader package. JSON config
remains supported for repositories that prefer static data.

Ambiguous default config discovery fails instead of silently choosing one file. This avoids
surprising provider or mode changes when a repository is migrating from JSON to TypeScript config.

Action config loading remains a separate boundary. This ADR does not add Action-side repository
config loading beyond existing inputs and environment handling.

## Validation

- `pnpm run build`
- `node --test packages/cli/test/cli.test.mjs`
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
