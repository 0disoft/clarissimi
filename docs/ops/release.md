# Release

- Status: Active

## Operational Contract

Cover release types, versioning, pre-release checklist, deployment flow, post-deploy verification, stop conditions, and owner handoff.

## Current Release Policy

Clarissimi is not ready for public package publication. ADR 0031 authorizes the first public root
GitHub Action release at immutable tag `v0.1.0` after every gate in this document passes for the
exact tag target commit. The corresponding GitHub Release must be marked as a pre-release.

The current root and workspace packages stay private at `0.0.0`. Do not bump package versions,
remove `private: true`, publish npm packages, create a moving `v0` tag, or publish to GitHub
Marketplace until a separate accepted release decision changes those boundaries.

## Release Types

- Source-only merge: allowed after `pnpm run docs`, `pnpm run release-readiness`,
  `pnpm run lint`, `pnpm run smoke`, `pnpm run check`, `pnpm run contract`, and repository hygiene
  checks pass.
- Dogfood workflow update: allowed when Action examples, permissions, `actionlint`, and root
  `action.yml` parsing pass.
- Public package publication: blocked.
- Versioned GitHub Action tag: allowed for immutable `v0.1.0` under ADR 0031 after all pre-release
  gates pass for the exact tag target commit.
- GitHub Marketplace publication: blocked.

## Pre-Release Gates

The versioned Action tag requires:

- live provider adapter credential handling is implemented and documented without fake secrets
- CLI and Action provider selection for live providers is implemented without making live calls part
  of correctness tests
- `.github/workflows/clarissimi-propose-fixture.yml` or an equivalent public repository scenario
  passes
- `.github/workflows/clarissimi-promote-draft-fixture.yml` passes before a release claims the
  approved-draft promotion flow
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
- `pnpm run bundle:action:check` proves the committed `action-dist/index.js` matches Action source
- secret scan shows no committed provider tokens, GitHub tokens, private keys, or environment files
- rollback instructions cover closing proposal pull requests and deleting proposal branches

Public package publication remains blocked even when every technical gate above passes. It needs a
separate accepted release decision covering package versions, registry authentication, provenance,
workspace publication scope, and package rollback.

## First Action Release Procedure

1. Run the local validation and hygiene gates against the final candidate checkout.
2. Push the candidate commit to `main` and confirm hosted CI for that exact SHA.
3. Run hosted live-provider smoke for the same SHA.
4. Create an external release evidence issue that identifies release type `versioned-action-tag`,
   release version `v0.1.0`, ADR 0031, both hosted run URLs, and the candidate SHA.
5. Create immutable tag `v0.1.0` at that SHA and create a GitHub pre-release linked to the evidence
   issue. Do not create or move a `v0` alias.
6. Verify the remote tag target, GitHub Release metadata, and a hosted live-provider smoke run using
   ref `v0.1.0`.

If validation fails before publication, do not create the tag. If a defect is found after
publication, keep `v0.1.0` immutable and publish a corrective patch tag such as `v0.1.1`. Delete or
replace the published tag only for an urgent security or supply-chain incident, after documenting
the old SHA, replacement SHA, user impact, and recovery path in a public issue.

For releases after `v0.1.0`, regenerate `action-dist/index.js` before candidate validation and
verify it with `pnpm run bundle:action:check`. The immutable `v0.1.0` tag keeps its original
consumer-time install and build behavior; do not move it to adopt the bundle.

## Hosted Live Provider Smoke

Run non-credentialed release gates before any provider token is used:

```powershell
pnpm run release-readiness
```

This command checks documentation links, release-critical package script registration, package and
script test-glob registration, the workspace package glob, workspace package manifest identity,
the blocked root and workspace package publication policy, public product-positioning guardrails,
workspace package publish surface, release policy document Action-release coverage, release tool
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
`--branch`, or `--workflow` only when validating a different release candidate.

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

Keep recent passed workflow evidence in this document so release readiness does not silently drift.
For the final release candidate, capture the exact hosted CI and hosted live-provider run URLs in
the release PR, release issue, or GitHub release notes after the final candidate commit is pushed.
Do not make an evidence-only commit after final candidate validation just to chase the candidate
SHA; that commit would create a new candidate and stale the evidence again.
Use `docs/ops/release-candidate-evidence.md` as the copyable evidence checklist for that external
release record.

Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run
`29052452214` passed on `2026-07-09T21:45:58Z` for validated source commit
`eaf22e44f5ef87391a16cf5a6597395826f05b7d` on `main` using repository secret
`CLARISSIMI_PROVIDER_TOKEN` and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29052452214`.
Refresh this evidence with
`pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
release-candidate commit before public package publication or a versioned Action tag, then attach
the final run URL outside the repository commit if updating this document would change the
candidate SHA.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`
- Release status: immutable Action tag `v0.1.0` is allowed by ADR 0031 after all gates pass; public
  package publication and GitHub Marketplace publication remain blocked
- Recent hosted CI validation evidence: `CI` workflow run `29052254866` passed on
  `2026-07-09T21:42:23Z` for validated source commit
  `eaf22e44f5ef87391a16cf5a6597395826f05b7d` on `main` and validated `docs`,
  `release-readiness`, `lint`, `smoke`, `check`, and `contract`. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29052254866`. Refresh this evidence with
  `pnpm run hosted-ci-validation` for the exact release-candidate commit before public package
  publication or a versioned Action tag; attach the final run URL outside the repository commit if
  updating this document would change the candidate SHA.
- Current dry-run dogfood evidence: `Clarissimi dry run` workflow run `29031384775` passed on
  `2026-07-09T15:54:58Z` at `77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb` and exercised the
  summary artifact validation path. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29031384775`.
- Current dogfood evidence: `Clarissimi propose fixture` workflow run
  `29027800039` passed on `2026-07-09T15:02:15Z` and updated proposal pull request
  `https://github.com/0disoft/clarissimi/pull/1`. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29027800039`. Fixture-only cleanup:
  pull request `#1` was closed after evidence capture, and branch
  `clarissimi/recognition/merged_pull_request-42` was deleted because `sample/project` fixture data
  is not intended to merge into the real repository ledger.
- Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run
  `29027802451` passed on `2026-07-09T15:02:10Z` and updated draft review pull request
  `https://github.com/0disoft/clarissimi/pull/2`. Run URL:
  `https://github.com/0disoft/clarissimi/actions/runs/29027802451`. Fixture-only cleanup:
  pull request `#2` was closed after evidence capture, and branch
  `clarissimi/drafts/merged_pull_request-42` was deleted because staged `sample/project` draft data
  is not intended to merge into the real repository draft inbox.
- Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
- Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`
  using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode
  Go chat completions endpoint, and `CLARISSIMI_PROVIDER_THINKING=disabled`.
- Current UMANS evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09` using
  maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`, and the UMANS
  OpenAI-compatible chat completions endpoint.
- Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run
  `29052452214` passed on `2026-07-09T21:45:58Z` for validated source commit
  `eaf22e44f5ef87391a16cf5a6597395826f05b7d` on `main` using repository secret
  `CLARISSIMI_PROVIDER_TOKEN` and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.
  Run URL: `https://github.com/0disoft/clarissimi/actions/runs/29052452214`. Refresh this evidence
  with `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before public package publication or a versioned Action tag; attach the
  final run URL outside the repository commit if updating this document would change the candidate
  SHA.
