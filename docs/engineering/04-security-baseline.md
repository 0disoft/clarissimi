# Security Baseline

- Status: Draft

## Contract

Security baseline covers trust boundaries, token handling, input validation, output validation,
external integrations, and leak response.

Baseline requirements:

- Default scope is public repository evidence.
- Private repository support is deferred.
- Redaction runs before provider calls.
- Provider tokens and GitHub tokens must not be stored in config files, examples, logs, Action
  outputs, or committed repository files.
- `packages/providers` accepts explicit token options but does not read environment variables.
- CLI and Action shells may load tokens only from their execution boundary.
- Action workflows must avoid default `pull_request_target` and untrusted PR head execution.
- Write-mode Action jobs need least-privilege permissions documented in `docs/github-action/`.
- Provider raw responses and raw error bodies must not be logged by default.
- Security-related recognition requires maintainer confirmation, labels, advisory refs, or test
  evidence before strong public claims.

## Required Evidence

- Source of truth: `docs/product/02-spec.md`, `docs/adr/0006-redaction-before-provider.md`,
  `docs/ops/secrets.md`, `docs/engineering/08-threat-model.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run smoke`, `pnpm run check`,
  `pnpm run contract`, secret scan
- Related checklist: `.agents/checklists/security.md`

## Review Blockers

- A change commits, logs, or renders provider tokens, GitHub tokens, private keys, raw provider
  responses, raw diffs, or sensitive evidence.
- A change bypasses redaction before provider calls.
- A change broadens Action permissions without updating permission docs and tests.
- A change runs untrusted PR head code.
