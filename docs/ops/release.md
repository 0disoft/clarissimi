# Release

- Status: Active

## Operational Contract

Cover release types, versioning, pre-release checklist, deployment flow, post-deploy verification, stop conditions, and owner handoff.

## Current Release Policy

Clarissimi is not ready for public package publication. ADR 0031 authorizes immutable root GitHub
Action releases beginning with `v0.1.0` after every gate in this document passes for the exact tag
target commit. ADR 0044 authorizes subsequent immutable `v0.x.y` releases within the same root
Action distribution boundary. ADR 0034 authorizes moving major alias `v0` only after it is tied to one explicitly
selected, already validated immutable `v0.x.y` release. ADR 0045 authorizes free GitHub Marketplace
publication beginning with non-prerelease release `v0.3.0`.

The current root and workspace packages stay private at `0.0.0`. Do not bump package versions,
remove `private: true`, publish npm packages, or create another moving major alias. Marketplace
publication is limited to the root Action release boundary accepted by ADR 0045.

## Release Types

- Source-only merge: allowed after `pnpm run docs`, `pnpm run release-readiness`,
  `pnpm run lint`, `pnpm run format`, `pnpm run migration-check`, `pnpm run smoke`,
  `pnpm run check`, `pnpm run contract`, and repository hygiene checks pass.
- Dogfood workflow update: allowed when Action examples, permissions, `actionlint`, and root
  `action.yml` parsing pass.
- Public package publication: blocked.
- Versioned GitHub Action tag: allowed for immutable `v0.x.y` tags under ADR 0044 after all
  pre-release gates pass for the exact tag target commit.
- Moving GitHub Action major alias: `v0` is allowed under ADR 0034 after the selected immutable
  release passes the alias verification and external consumer gates.
- GitHub Marketplace publication: allowed for the validated root Action under ADR 0045; npm and
  workspace-package publication remain blocked.

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
- `pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>` passes in the private
  `0disoft/integration-lab` consumer repository for the immutable candidate ref
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

## Marketplace Release Procedure

The first Marketplace release is `v0.3.0`. It follows every versioned Action gate above and adds
the following requirements:

1. Root `action.yml` remains the only Action metadata file and includes supported Marketplace
   branding.
2. A public Marketplace search finds no existing Action named `Clarissimi` before publication.
3. Candidate evidence uses release type `marketplace-action-tag`, release version `v0.3.0`, and the
   exact candidate SHA.
4. Publish the immutable tag as a non-draft, non-prerelease GitHub Release:

   ```powershell
   pnpm run publish-action-release -- --version v0.3.0 --sha <candidate-sha> --release-kind stable
   ```

5. In GitHub's release UI, enable `Publish this Action to the GitHub Marketplace`, choose the
   primary category `Code review` and secondary category `Utilities`, and complete the GitHub-owned
   developer-agreement and two-factor-authentication gates when requested.
6. Verify the public Marketplace listing resolves to `0disoft/clarissimi`, identifies the expected
   release as `Latest`, and renders the matching Action reference before alias promotion:

   ```powershell
   pnpm run verify-marketplace-release -- --version <v0.x.y>
   ```

   The verifier fails closed when the listing is unavailable, the `Latest` version differs, or the
   rendered README still names an older Action reference. A version mismatch prints the exact
   GitHub release edit URL for the required interactive handoff.

7. Run post-tag validation for the selected immutable release, then promote `v0` separately
   through ADR 0034.

Marketplace publication is intentionally interactive because GitHub owns the agreement, category,
and release checkbox state.

Current publication record:

- public listing: <https://github.com/marketplace/actions/clarissimi>
- immutable release: <https://github.com/0disoft/clarissimi/releases/tag/v0.3.5>
- exact release SHA: `b1654c4f88c231b8f6beeee399c990b63d935ecc`
- compatibility-named release record issue: <https://github.com/0disoft/clarissimi/issues/16>
- the listing identifies `v0.3.5` as `Latest`, renders `0disoft/clarissimi@v0.3.5`, and exposes
  categories `Code review` and `Utilities`
- `v0` resolves to the same exact release SHA after compare-and-swap promotion

Marketplace release `v0.3.5` publishes bounded provider-quality failure summaries, a scrubbed
observed-failure corpus intake contract, and maintainer-owned multi-model evaluation. Raw provider
output, messages, prompts, and credentials remain excluded from summaries and committed failure
fixtures. The release changes no Action input, output, permission, trigger, approval, ledger, or
package-publication boundary. Its exact-SHA candidate validation, stable release publication,
public Marketplace verification, post-tag external validation, and separate `v0` promotion passed.

The first post-tag full-write run `29324962538` had one Ubuntu job fail while GitHub returned its
`Unicorn!` timeout HTML during draft PR creation. macOS and Windows passed, cleanup ran, and orphan
audit run `29325038208` found no residue. A complete new-correlation post-tag validation then passed
on all three runners; the failed attempt is retained as a transient GitHub API reliability signal,
not erased or counted as the final release result.

Current promotion validation record:

- candidate hosted CI: <https://github.com/0disoft/clarissimi/actions/runs/29405337035>
- candidate live provider: <https://github.com/0disoft/clarissimi/actions/runs/29405421863>
- candidate dry-run matrix: <https://github.com/0disoft/integration-lab/actions/runs/29405452594>
- candidate full-write matrix and cleanup: <https://github.com/0disoft/integration-lab/actions/runs/29405505998>
- candidate orphan audit: <https://github.com/0disoft/integration-lab/actions/runs/29405562488>
- exact-tag post-tag live provider: <https://github.com/0disoft/clarissimi/actions/runs/29405698127>
- exact-tag post-tag dry-run matrix: <https://github.com/0disoft/integration-lab/actions/runs/29405728749>
- exact-tag post-tag full-write matrix and cleanup: <https://github.com/0disoft/integration-lab/actions/runs/29405764991>
- exact-tag post-tag orphan audit: <https://github.com/0disoft/integration-lab/actions/runs/29405822411>
- promotion-contract hosted CI: <https://github.com/0disoft/clarissimi/actions/runs/29406398072>
- live provider through `v0.3.5`: <https://github.com/0disoft/clarissimi/actions/runs/29406507120>
- external `v0` dry-run matrix: <https://github.com/0disoft/integration-lab/actions/runs/29406540337>
- external `v0` full-write matrix and cleanup: <https://github.com/0disoft/integration-lab/actions/runs/29406574270>
- external `v0` orphan audit: <https://github.com/0disoft/integration-lab/actions/runs/29406634824>

In maintainer-facing summaries, use **result** for a pass/fail outcome and **validation record** for
the SHA, run IDs, timestamps, and URLs that support it. Keep **evidence** only where it is already a
domain or compatibility term, such as repository evidence, `evidence-id`, release evidence issue
titles, and existing script names.

- Marketplace rollback: clear the Marketplace setting without deleting or moving the immutable tag.
- Code rollback: publish a corrective immutable release and move `v0` only after verification.

## First Action Release Procedure

1. Run the local validation and hygiene gates against the final candidate checkout.
2. Push the candidate commit to `main` and confirm hosted CI for that exact SHA.
3. Run hosted live-provider smoke for the same SHA and external dry-run plus full-write consumer
   smoke for the exact candidate SHA or release tag.
4. Create an external release evidence issue that identifies release type `versioned-action-tag`,
   release version `v0.1.0`, ADR 0031, all four run URLs, and the candidate SHA.
5. Create immutable tag `v0.1.0` at that SHA and create a GitHub pre-release linked to the evidence
   issue. The first release does not create `v0`; later promotion follows ADR 0034.
6. Verify the remote tag target, GitHub Release metadata, and a hosted live-provider smoke run using
   ref `v0.1.0`.

If validation fails before publication, do not create the tag. If a defect is found after
publication, keep `v0.1.0` immutable and publish a corrective patch tag such as `v0.1.1`. Delete or
replace the published tag only for an urgent security or supply-chain incident, after documenting
the old SHA, replacement SHA, user impact, and recovery path in a public issue.

For releases after `v0.1.0`, regenerate `action-dist/index.js` before candidate validation and
verify it with `pnpm run bundle:action:check`. The immutable `v0.1.0` tag keeps its original
consumer-time install and build behavior; do not move it to adopt the bundle.

After the versioned evidence issue exists for the exact candidate SHA, publish the selected
immutable tag and GitHub release with the repository-owned publisher:

```powershell
pnpm run publish-action-release -- --version <v0.x.y> --sha <candidate-sha>
```

The publisher requires a clean worktree, one exact matching release evidence issue, and a remote
candidate commit. It refuses mismatched existing tags, creates only an annotated immutable tag,
verifies the requested prerelease or stable GitHub Release kind and resolved tag commit, and closes
the completed evidence issue.
If tag publication succeeds but release creation fails, rerun the same command; it accepts only the
same immutable tag target and continues the missing release step.

## Major Alias Promotion

Promote `v0` only after the selected immutable version tag and non-draft GitHub Release exist and
all versioned-release evidence is complete:

```powershell
pnpm run promote-action-major-alias -- --release-version <v0.x.y> --sha <commit-sha>
```

The repository-owned promoter performs the following steps as one fail-closed operation:

1. Record the current remote `v0` SHA, or record that the alias does not exist.
2. Select the target immutable `v0.x.y` tag and resolve its peeled commit SHA. Do not infer the
   target from the newest available tag.
3. Create `v0`, or move it with a compare-and-swap lease that expects the recorded old SHA.
4. Run
   `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`.
5. Run external dry-run and full-write smoke with `clarissimi-ref=v0` and the same
   `expected-sha=<commit-sha>` on Ubuntu, macOS, and Windows.
6. Run the read-only orphan audit after full-write cleanup.

If any post-promotion check fails, restore `v0` to the recorded old SHA with a lease. If this was
the first alias creation, delete only `v0`. Never move or delete the immutable patch tag as an alias
rollback. Consumers that need reproducible dependency review should pin the patch tag or commit SHA.
The promoter is idempotent: when `v0` already identifies the selected commit, it skips the ref write
but repeats every verification and hosted evidence gate.

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
dogfood evidence, repository-wide `format` and migration compatibility gates, CI
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

After hosted CI passes, exercise the Action from a separate consumer repository. Omit the option to
test the current Clarissimi `HEAD` SHA, pass an immutable release tag, or test `v0` with the exact
expected commit SHA:

```powershell
pnpm run hosted-external-consumer-smoke
pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0.1.1
pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0 --expected-sha <commit-sha>
```

The helper rejects moving Clarissimi refs other than `v0`; that alias requires `--expected-sha`.
It dispatches `clarissimi.yml` in the private `0disoft/integration-lab` repository and watches the
resulting workflow to completion. The consumer workflow checks the resolved Action commit before
invoking the local Action path, so this gate detects alias drift, consumer checkout, bundle startup,
and input-contract failures that Clarissimi's same-repository dogfood cannot expose. It uses the
maintainer's authenticated `gh` session and does not read provider secrets.

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
For the final release candidate, capture the exact hosted CI, external consumer, and hosted
live-provider run URLs in the release PR, release issue, or GitHub release notes after the final
candidate commit is pushed.
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

Recent external consumer evidence: `Clarissimi external consumer` workflow run `29083278366`
passed in `0disoft/integration-lab` for immutable tag `v0.1.1` on Ubuntu, macOS, and Windows.
Full-write matrix run `29084798439` then passed stage, approval, promotion, recognition verification,
and cleanup on all three runners without mutating `main`. Read-only orphan audit run `29084888305`
confirmed no run-specific pull request or branch residue remained.
Run URLs: `https://github.com/0disoft/integration-lab/actions/runs/29083278366`,
`https://github.com/0disoft/integration-lab/actions/runs/29084798439`, and
`https://github.com/0disoft/integration-lab/actions/runs/29084888305`.
Refresh this evidence with
`pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>` for the exact immutable
release candidate, then attach the final run URL outside the repository commit if updating this
document would change the candidate SHA.
`pnpm run release-candidate-evidence-issue` requires `--external-run <run-id>` and
`--external-write-run <run-id>`. It verifies that both workflow display titles name the exact ref
and that every full-write runner and required cleanup step succeeded before it creates or prints
evidence.

Maintainers can collect the complete hosted evidence set and render the issue body with
`pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model>`. This
defaults to an issue preview; `--create-issue` is required for GitHub issue creation. Preview mode
still dispatches the credentialed, external dry-run, full-write, and orphan-audit workflows.
If the full-write run leaves integration-lab residue, preview the bounded recovery set with
`pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`. Apply cleanup only after
reviewing that output, then rerun the read-only orphan audit.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`
- Release status: immutable `v0.x.y` Action tags are allowed by ADR 0044, moving major alias `v0`
  is allowed by ADR 0034 after exact-SHA verification, and free root Action Marketplace publication
  is allowed by ADR 0045; public package publication remains blocked
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
