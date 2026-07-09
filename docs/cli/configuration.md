# CLI Configuration

- Status: Draft
- Repository Type: cli-tool

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Schema ownership: `packages/schemas` once implementation begins
- Redaction boundary: `docs/adr/0006-redaction-before-provider.md`
- Provider boundary: `docs/adr/0007-provider-adapter-boundary.md`

## Supported Config Files

Clarissimi should support:

- `clarissimi.config.ts`
- `.clarissimi/config.json`

The exact precedence order is not implemented yet. The first implementation should prefer explicit
CLI flags over config file values and config file values over package defaults.

The current JSON config supports:

- `provider`: `fake` or `openai-compatible`
- `providerModel`: model name for `openai-compatible`
- `providerEndpoint`: optional OpenAI-compatible chat completions endpoint
- `mode`: `dry-run`, `propose`, or `commit`

Explicit CLI flags override config file values for provider selection.

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

## Review Blockers

- Config examples include fake tokens or real-looking secrets.
- Config allows public numeric contributor scores by default.
- Config bypasses redaction before provider calls.
- Config changes are not reflected in schemas and validation docs.
