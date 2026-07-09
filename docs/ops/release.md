# Release

- Status: Draft

## Operational Contract

Cover release types, versioning, pre-release checklist, deployment flow, post-deploy verification, stop conditions, and owner handoff.

## Current Release Policy

Clarissimi is not ready for public package publication. The repository may continue to merge and
dogfood source changes on `main`, but npm package publication, marketplace release notes, or a
versioned Action tag must wait until the pre-release gates below are satisfied.

The current root package stays private at `0.0.0`. Do not bump versions, publish packages, or create
release tags as part of ordinary implementation work until maintainers accept a release ADR or
update this operational contract.

## Release Types

- Source-only merge: allowed after `pnpm run check`, `pnpm run contract`, and repository hygiene
  checks pass.
- Dogfood workflow update: allowed when Action examples, permissions, `actionlint`, and root
  `action.yml` parsing pass.
- Public package publication: blocked.
- Versioned GitHub Action tag: blocked.

## Pre-Release Gates

Public package publication and versioned Action tags require:

- live provider adapter credential handling is implemented and documented without fake secrets
- CLI and Action provider selection for live providers is implemented without making live calls part
  of correctness tests
- `.github/workflows/clarissimi-propose-fixture.yml` or an equivalent public repository scenario
  passes
- hosted CI workflow `.github/workflows/ci.yml`, including its non-credentialed
  `release-readiness` step, passes on the release candidate commit
- `pnpm run check`
- `pnpm run contract`
- `pnpm run smoke`
- `pnpm run live-provider-smoke` with maintainer-owned live provider credentials
- `.github/workflows/clarissimi-live-provider-smoke.yml` passes when using maintainer-owned
  repository secret configuration and a dispatch-time provider model
- `pnpm run docs`
- `pnpm run release-readiness` for non-credentialed release gate checks
- `ssealed doctor . --json`
- `actionlint` for workflow examples
- root `action.yml` parses with `yq`
- secret scan shows no committed provider tokens, GitHub tokens, private keys, or environment files
- rollback instructions cover closing proposal pull requests and deleting proposal branches

## Hosted Live Provider Smoke

Run non-credentialed release gates before any provider token is used:

```powershell
pnpm run release-readiness
```

This command checks documentation links, release-critical package script registration, package and
script test-glob registration, release tool availability, `ssealed doctor`, workflow `actionlint`,
YAML parsing with `yq`, Action manifest contract drift, hosted CI workflow contract drift, dogfood
workflow contract drift, `git diff --check`, and a high-risk secret pattern scan. It does not call
live providers and does not replace the credentialed smoke gates below.

After `CLARISSIMI_PROVIDER_TOKEN` is configured as a repository secret, run the manual hosted smoke
from a maintainer shell without printing the token value:

```powershell
pnpm run hosted-live-provider-smoke -- --model gpt-4.1-mini
```

To configure the repository secret from an existing maintainer-owned environment variable without
printing the token, use standard input rather than putting the secret value in the command text:

```powershell
$env:OPENAI_API_KEY | gh secret set CLARISSIMI_PROVIDER_TOKEN --repo 0disoft/clarissimi --app actions
```

Use the same pattern with another maintainer-owned provider environment variable when testing a
gateway provider. After setting or rotating the secret, confirm only the secret name is visible:

```powershell
gh secret list --repo 0disoft/clarissimi --app actions --json name,updatedAt
```

For OpenAI-compatible gateway providers that need an endpoint or thinking-mode override, pass those
as script options instead of editing repository files:

```powershell
pnpm run hosted-live-provider-smoke -- --model minimax-m3 --endpoint <chat-completions-url> --thinking disabled
```

The script verifies that the repository secret name exists, dispatches
`.github/workflows/clarissimi-live-provider-smoke.yml`, finds the matching run for the selected
ref, and watches it to completion. It validates a non-empty model, an HTTPS endpoint when provided,
the supported thinking-mode value, repository name, and ref before reading repository secret
metadata or dispatching the workflow. The workflow repeats provider input validation before
checkout, dependency installation, build work, or provider calls. It never reads or prints the
provider token value. If a maintainer needs to run the underlying commands manually, use
`gh workflow run` followed by `gh run list` and `gh run watch` with the same workflow, model,
endpoint, and thinking inputs.

Record the passed workflow run id and provider model in this document before public package
publication or a versioned Action tag.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `check`, `contract`, `smoke`, `docs`, `release-readiness`
- Release blocker status: public package publication and versioned Action tags are blocked
- Current dogfood evidence: `Clarissimi propose fixture` workflow run
  `28984721611` passed on `2026-07-09T00:14:30Z` and created proposal pull request
  `https://github.com/0disoft/clarissimi/pull/1`.
- Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run
  `28992586329` passed on `2026-07-09T03:47:20Z` and created draft review pull request
  `https://github.com/0disoft/clarissimi/pull/2`.
- Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
- Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode
  Go chat completions endpoint, and `CLARISSIMI_PROVIDER_THINKING=disabled`.
- Current UMANS evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09` using
  maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`, and the UMANS
  OpenAI-compatible chat completions endpoint.
- Remaining operational risk: hosted manual live-provider smoke workflow evidence with repository
  secret configuration is not complete.
