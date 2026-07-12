# CLI Configuration

- Status: Draft
- Repository Type: cli-tool

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Schema ownership: `packages/schemas`
- Redaction boundary: `docs/adr/0006-redaction-before-provider.md`
- Provider boundary: `docs/adr/0007-provider-adapter-boundary.md`
- Config schema boundary: `docs/adr/0025-centralize-config-schema-validation.md`
- TypeScript config loader boundary: `docs/adr/0028-add-native-typescript-config-loading.md`

## Supported Config Files

Clarissimi should support:

- `clarissimi.config.ts`
- `.clarissimi/config.json`

The current implementation loads either supported file. Default discovery checks
`clarissimi.config.ts` and `.clarissimi/config.json`; if both exist, the CLI fails closed and
requires `--config <path>` so migration between formats is explicit.

`packages/schemas` validates supported config values. The CLI owns file loading and precedence.

Current precedence is:

1. explicit CLI flags
2. explicit `--config <path>` or the single discovered config file
3. package defaults

The current config object supports:

- `provider`: `fake` or `openai-compatible`
- `providerModel`: model name for `openai-compatible`
- `providerEndpoint`: optional OpenAI-compatible chat completions endpoint
- `providerEndpointTrust`: `public` or `private-network`, default `public`; public endpoints require
  credential-free HTTPS with a public-form hostname or address
- `providerThinking`: optional OpenAI-compatible thinking mode; currently only `disabled`
- `mode`: `dry-run`, `propose`, or `commit` as schema-recognized output mode values
- `markdownSummary`: `none` or `table`; `table` adds a compact contributor summary before the
  existing detailed `CONTRIBUTORS.md` sections

TypeScript config files must be named `clarissimi.config.ts` and must export a default config
object. They are loaded through the Node.js 24 runtime rather than a third-party loader dependency.

`recognize` currently supports only `dry-run`; a config value such as `mode: "propose"` or
`mode: "commit"` is parsed but rejected by that command before provider calls. The current
implemented write paths are owned by the GitHub Action `propose` and `stage-draft` modes. Direct
`commit` writes remain reserved for a future explicit write-mode decision.

`recognize`, `import-draft`, and `rebuild` accept `--markdown-summary none|table` as an explicit
override. The default `none` value preserves the detailed-only Markdown layout.

## Expected Configuration Areas

- provider selection
- provider model
- output mode: `dry-run`, `propose`, and future direct-write `commit`
- confidence threshold
- contribution type policy
- impact-level policy
- opt-out contributors
- linked issue author recognition policy
- redaction options
- renderer targets

## Sensitive Values

Provider API keys and GitHub tokens must not be stored in config files. They belong in environment
variables, local secret stores, or GitHub Actions secrets.

The CLI reads `CLARISSIMI_PROVIDER_TOKEN` only when `provider` is `openai-compatible`.
Provider thinking settings are non-secret request compatibility options and must not be used to
store provider tokens or prompt content.

## Review Blockers

- Config examples include fake tokens or real-looking secrets.
- Config allows public numeric contributor scores by default.
- Config bypasses redaction before provider calls.
- Config changes are not reflected in schemas and validation docs.
