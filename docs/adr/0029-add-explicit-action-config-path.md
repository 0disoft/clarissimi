# ADR 0029: Add Explicit Action Config Path

- Status: Accepted
- Date: 2026-07-10
- Owner: Repository maintainers

## Context

The CLI can load `clarissimi.config.ts` and `.clarissimi/config.json`, but the GitHub Action has
only accepted explicit Action inputs and workflow environment variables. The product direction
expects repository configuration to be available for automated runs, but default automatic config
discovery in a GitHub Action would expand the execution surface: `clarissimi.config.ts` is
repository code.

The Action already avoids untrusted pull request head code. Any config-file loading must preserve
that property and must not make provider secrets plain Action inputs or repository files.

## Decision

Add an explicit optional Action input:

- `config-path`

The Action loads a config file only when `config-path` is provided. It does not automatically
discover `clarissimi.config.ts` or `.clarissimi/config.json`.

When provided, `config-path` is resolved relative to `GITHUB_WORKSPACE` unless it is already an
absolute path. Supported files are:

- `clarissimi.config.ts`
- JSON config files, including `.clarissimi/config.json`

Loaded values are validated through `packages/schemas`. Action inputs and workflow environment
values remain higher precedence than config values. Provider tokens remain outside config files and
outside Action inputs; `CLARISSIMI_PROVIDER_TOKEN` stays a workflow environment or secret value.

Unsupported `mode` input values fail before config-file loading, so a malformed or malicious config
path cannot run before mode validation. If `INPUT_MODE` is absent in a direct runner invocation, a
config `mode` may provide the mode before falling back to `propose`.

## Consequences

Repositories can share provider model, endpoint, thinking mode, and mode defaults with the local CLI
without duplicating those settings in every workflow. Maintainers still opt into config-file
execution explicitly from workflow YAML.

The Action package owns this file-loading boundary because it owns Action input handling and runner
behavior. `packages/schemas` continues to own the shared config value validation vocabulary.

## Validation

- `pnpm run build`
- `node --test packages/action/test/action.test.mjs`
- `node --test scripts/test/release-readiness.test.mjs`
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
