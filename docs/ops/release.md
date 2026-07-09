# Release

- Status: Draft

## Operational Contract

Cover release types, versioning, pre-release checklist, deployment flow, post-deploy verification, stop conditions, and owner handoff.

## Current Release Policy

Clarissimi is not ready for public package publication. The repository may continue to merge and
dogfood source changes on `main`, but npm package publication, marketplace release notes, or a
versioned Action tag remain blocked until maintainers accept a release ADR or update this
operational contract. The pre-release evidence below records the current technical readiness gates.

The current root package stays private at `0.0.0`. Do not bump versions, publish packages, or create
release tags as part of ordinary implementation work until maintainers accept a release ADR or
update this operational contract.

## Release Types

- Source-only merge: allowed after `pnpm run docs`, `pnpm run release-readiness`,
  `pnpm run lint`, `pnpm run smoke`, `pnpm run check`, `pnpm run contract`, and repository hygiene
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
- `pnpm run hosted-ci-validation` confirms the hosted `CI` workflow passed for the release
  candidate commit
- `pnpm run lint`
- `pnpm run check`
- `pnpm run contract`
- `pnpm run smoke`
- package pack dry-run coverage for every workspace package through `pnpm run smoke`
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
script test-glob registration, the workspace package glob, workspace package manifest identity,
the blocked root and workspace package release policy, public product-positioning guardrails,
workspace package publish surface, release policy document blocked-status coverage, release tool
availability, package ownership table coverage, internal workspace dependency graph, package
publication metadata, TypeScript project-reference build graph, recorded dry-run and write-mode
dogfood evidence, the intentionally fail-closed `format` and `migration-check` placeholders, CI
runtime and release-tool pin drift,
rollback procedure coverage, `ssealed doctor`, workflow `actionlint`, YAML parsing with `yq`,
Action manifest contract drift, hosted CI workflow contract drift, dogfood workflow contract drift,
hosted live-provider workflow trigger, permission, preflight, runtime, and command drift,
`git diff --check`, tracked generated-output drift, and a high-risk secret pattern scan. It does
not call live providers and does not replace the credentialed smoke gates below.

After local gates and after the release candidate commit is pushed, confirm hosted CI for that
exact commit:

```powershell
pnpm run hosted-ci-validation
```

The hosted CI validation helper uses `gh run list` to find the `CI` workflow run for the selected
commit and uses `gh run watch` when the run is still queued or in progress. It defaults to the
current local `HEAD`, `0disoft/clarissimi`, `main`, and workflow `CI`; pass `--sha`, `--repo`,
`--ref`, or `--workflow` only when validating a different release candidate.

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

Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run
`29018826925` passed on `2026-07-09T12:39:17Z` from `main` at
`799119fd146bb6e62bf0413caf0773559aee63ee` using repository secret
`CLARISSIMI_PROVIDER_TOKEN` and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29018826925`.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags are blocked
- Current dry-run dogfood evidence: `Clarissimi dry run` workflow run `29031384775` passed on
  `2026-07-09T15:54:58Z` at `77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb` and exercised the
  summary artifact validation path. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29031384775`.
- Current dogfood evidence: `Clarissimi propose fixture` workflow run
  `29027800039` passed on `2026-07-09T15:02:15Z` and updated proposal pull request
  `https://github.com/0disoft/clarissimi/pull/1`. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29027800039`.
- Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run
  `29027802451` passed on `2026-07-09T15:02:10Z` and updated draft review pull request
  `https://github.com/0disoft/clarissimi/pull/2`. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29027802451`.
- Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
- Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode
  Go chat completions endpoint, and `CLARISSIMI_PROVIDER_THINKING=disabled`.
- Current UMANS evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09` using
  maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`, and the UMANS
  OpenAI-compatible chat completions endpoint.
- Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run
  `29018826925` passed on `2026-07-09T12:39:17Z` using repository secret
  `CLARISSIMI_PROVIDER_TOKEN` and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
  Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29018826925`.
