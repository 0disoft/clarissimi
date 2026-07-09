# ADR 0025: Centralize Config Schema Validation

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

The fixture-first CLI currently loads `.clarissimi/config.json` and validates provider and mode
values locally. That was acceptable while only one command path consumed config, but the product and
monorepo contracts already treat `packages/schemas` as the source for shared schema vocabulary and
runtime validation.

If every runner validates config values independently, CLI and Action behavior can drift around
provider identifiers, mode names, provider thinking options, and future config fields.

## Decision

Move shared JSON config value validation into `packages/schemas`.

`packages/schemas` owns:

- `ClarissimiConfig` TypeScript shape for the supported JSON config surface
- provider identifiers supported by config
- provider thinking mode values supported by config
- configured output mode values
- runtime validation of config object values

`packages/cli` still owns:

- locating `.clarissimi/config.json`
- accepting explicit `--config <path>`
- rejecting unsupported config file formats
- reading file contents
- applying CLI flag precedence over config defaults
- mapping schema validation failures to CLI exit code `2`

CLI flags and GitHub Action inputs that accept the same provider identifiers or provider thinking
values should reuse the exported schema guards instead of redefining those value sets.

The config schema must not store or validate provider tokens. Tokens stay in process environment,
local secret stores, or GitHub Actions secrets.

## Consequences

Future CLI or Action config consumers can import one shared schema contract instead of duplicating
config vocabulary. The CLI remains the local orchestration shell and filesystem boundary, but it no
longer owns shared config value validation.

## Validation

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
