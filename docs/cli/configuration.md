# CLI Configuration

- Status: Draft
- Repository Type: cli-tool

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Schema ownership: `packages/schemas`
- Redaction boundary: `docs/adr/0006-redaction-before-provider.md`
- Provider boundary: `docs/adr/0007-provider-adapter-boundary.md`
- Config schema boundary: `docs/adr/0025-centralize-config-schema-validation.md`

## Supported Config Files

Clarissimi should support:

- `clarissimi.config.ts`
- `.clarissimi/config.json`

The current implementation loads `.clarissimi/config.json`. TypeScript config loading remains
deferred until a safe loader decision exists.

`packages/schemas` validates supported config values. The CLI owns file loading and precedence.

Current precedence is:

1. explicit CLI flags
2. `.clarissimi/config.json`
3. package defaults

The current JSON config supports:

- `provider`: `fake` or `openai-compatible`
- `providerModel`: model name for `openai-compatible`
- `providerEndpoint`: optional OpenAI-compatible chat completions endpoint
- `providerThinking`: optional OpenAI-compatible thinking mode; currently only `disabled`
- `mode`: `dry-run`, `propose`, or `commit`

`recognize` currently supports only `dry-run`; a config value such as `mode: "propose"` is parsed
but rejected by that command before provider calls. Write modes are owned by the GitHub Action path.

## Expected Configuration Areas

- provider selection
- provider model
- output mode: `dry-run`, `propose`, or `commit`
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
