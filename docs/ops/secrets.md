# Secrets

- Status: Draft

## Operational Contract

Separate secrets from regular config and include inventory, access, rotation, CI/deployment handling, logs, and leak response.

## Secret Inventory

Clarissimi must not commit, log, or render these values:

- GitHub tokens used by `propose` mode
- provider API tokens for OpenAI-compatible, OpenRouter-compatible, Anthropic, Gemini, or local
  gateway providers
- private keys, `.env` files, email addresses, and security-sensitive evidence details covered by
  the redaction layer

## Provider Token Handling

`packages/providers` does not read environment variables, config files, or secret stores. The
OpenAI-compatible adapter accepts an explicit token option from its caller, sends it only in the
Authorization header, and keeps raw provider error bodies out of thrown error messages by default.

CLI and GitHub Action live-provider wiring load provider tokens only from the boundary that owns
execution secrets. The current shared token name is `CLARISSIMI_PROVIDER_TOKEN`. Config files and
action inputs may name a provider, endpoint, and model, but must not store token values.

The release-only live provider smoke uses `CLARISSIMI_PROVIDER_TOKEN`,
`CLARISSIMI_PROVIDER_MODEL`, and optional `CLARISSIMI_PROVIDER_ENDPOINT`. It must run only in a
maintainer-controlled environment that owns those values.

Local credentialed live-provider smoke passed on `2026-07-09` with maintainer-owned credentials
mapped in-process to `CLARISSIMI_PROVIDER_TOKEN` and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`. The
run did not require writing a token value to a repository file.

The manual GitHub workflow `.github/workflows/clarissimi-live-provider-smoke.yml` reads
`CLARISSIMI_PROVIDER_TOKEN` from repository secrets. The provider model is a required workflow
dispatch input, and the optional provider endpoint may also be supplied as a dispatch input.

## Leak Response

If a token, private key, raw provider output, raw diff, or sensitive evidence appears in a public
output, Action summary, CLI JSON, pull request body, or repository file:

1. Stop the release or dogfood run.
2. Revoke or rotate the affected credential.
3. Close or revert the unsafe proposal pull request.
4. Delete unsafe generated artifacts or branches according to `docs/ops/rollback.md`.
5. Rerun secret scan, `pnpm run docs`, `pnpm run smoke`, `pnpm run check`, and `pnpm run contract`.

## Owners

- Primary owner: UNASSIGNED
- Backup owner: UNASSIGNED
- Escalation path: UNDECIDED

## Validation

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Remaining operational risk: hosted manual live-provider smoke workflow evidence with repository
  secret configuration is not complete.
