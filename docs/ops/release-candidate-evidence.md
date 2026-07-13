# Release Candidate Evidence

## One-command orchestration

For a source-only candidate already pushed to `main`, run:

```powershell
pnpm run release-candidate-evidence-orchestrator -- --provider-model <provider-model> --sha <candidate-sha>
```

The command verifies hosted CI for the exact SHA, then dispatches and watches the hosted
live-provider smoke, external dry-run smoke, external full-write smoke, and external orphan audit.
Before any dispatch, it verifies that the candidate ref resolves to the requested SHA and that all
five required workflows are readable at their configured refs. A failed preflight makes no hosted
workflow changes and avoids spending a provider call on a partially configured evidence run.
It generates one 32-character evidence correlation id and passes it to every dispatched workflow.
The id appears in each run title, so concurrent runs for the same candidate cannot be mistaken for
the run created by this command. The same id is recorded in the evidence issue preview.
It finally calls the evidence-issue helper with the collected run IDs. The default renders an issue
preview and does not create an issue. It still dispatches hosted workflows and the full-write smoke
temporarily creates synthetic pull requests and branches before cleanup.

After reviewing the preview, add `--create-issue` to create the evidence issue. For a versioned
Action tag, also pass `--release-type versioned-action-tag --release-version <v0.x.y>`. Before the
tag exists, the orchestrator uses the candidate SHA as the immutable external consumer ref and
records both the intended release version and tested SHA in the evidence issue. An explicit
`--external-ref <v0.x.y>` remains available when revalidating an already-created immutable tag. If
the full-write smoke fails after dispatch, the orchestrator still runs the orphan audit before
returning failure.

If a failed full-write run leaves reserved smoke resources, inspect the exact completed run first:

```powershell
pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>
```

The command defaults to a JSON preview. It matches only open pull requests and branches whose names
are deterministically reserved for that run's Ubuntu, macOS, and Windows jobs. After reviewing the
preview, add `--apply` to close those pull requests and delete those branches. The apply path makes a
second read and fails unless all matched residue is gone. Rerun the read-only orphan audit afterward.

- Status: Draft

## Purpose

This checklist captures final release-candidate evidence without creating an evidence-only commit
that changes the candidate SHA. Use it for a release pull request, release issue, or GitHub release
notes after the final candidate commit is pushed.

Do not paste provider tokens, GitHub tokens, private keys, raw provider output, raw diffs, or
private environment values into this evidence. Record secret names, workflow run URLs, commit SHAs,
models, validation names, and conclusions only.

## Final Candidate Identity

- Candidate commit SHA:
- Branch:
- Release type: source-only merge, public package publication, or versioned Action tag
- Release version, when tagging:
- Release decision reference: release ADR, release issue, or maintainer approval URL

## Local Validation Evidence

Record command results from the final candidate checkout:

- `pnpm run docs`:
- `pnpm run release-readiness`:
- `pnpm run lint`:
- `pnpm run smoke`:
- `pnpm run check`:
- `pnpm run contract`:
- `git diff --check`:
- final newline scan:
- secret scan:

## Hosted CI Evidence

Run this after the candidate commit is pushed:

```powershell
pnpm run hosted-ci-validation -- --sha <candidate-sha>
```

Record:

- Workflow name: `CI`
- Run URL:
- Run id:
- Run conclusion:
- Run timestamp:
- Validated source commit SHA:
- Validation commands covered: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`

## Hosted Live Provider Evidence

Run this after the candidate commit is pushed and repository secret `CLARISSIMI_PROVIDER_TOKEN` is
configured:

```powershell
pnpm run hosted-live-provider-smoke -- --model <provider-model>
```

Record:

- Workflow name: `Clarissimi live provider smoke`
- Run URL:
- Run id:
- Run conclusion:
- Run timestamp:
- Validated source commit SHA:
- Repository secret name: `CLARISSIMI_PROVIDER_TOKEN`
- Provider model:
- Provider endpoint override, if any:
- Provider thinking mode, if any:

## External Consumer Evidence

Run this after the candidate commit is pushed. The helper accepts only an immutable version tag or
40-character commit SHA:

```powershell
pnpm run hosted-external-consumer-smoke -- --clarissimi-ref <tag-or-sha>
```

Record:

- Consumer repository: `0disoft/integration-lab`
- Workflow name: `Clarissimi external consumer`
- Run URL:
- Run id:
- Run conclusion:
- Run timestamp:
- Clarissimi tag or commit SHA under test:
- Consumer workflow commit SHA:

## External Full-Write Evidence

Run the cleanup-safe full-write matrix for the same immutable Clarissimi ref:

```powershell
gh workflow run clarissimi-full-write-smoke.yml --repo 0disoft/integration-lab --ref main -f clarissimi-ref=<tag-or-sha>
```

Record:

- Consumer repository: `0disoft/integration-lab`
- Workflow name: `Clarissimi full write smoke`
- Run URL:
- Run id:
- Run conclusion:
- Run timestamp:
- Clarissimi tag or commit SHA under test:
- Consumer workflow commit SHA:
- Ubuntu job conclusion:
- macOS job conclusion:
- Windows job conclusion:
- Stage, approval, promotion, recognition verification, and cleanup step conclusions:

## Evidence Issue Helper

After hosted CI and hosted live-provider smoke pass for the same candidate SHA, and external
consumer dry-run and full-write smoke pass for the corresponding immutable Clarissimi ref, create
or preview a release evidence issue from the run metadata:

```powershell
pnpm run release-candidate-evidence-issue -- --sha <candidate-sha> --ci-run <ci-run-id> --live-run <live-run-id> --external-run <external-run-id> --external-write-run <full-write-run-id> --provider-model <provider-model>
```

Use `--print` to preview the issue body without creating a public GitHub issue. The helper validates
that hosted CI and live-provider runs completed successfully, match the selected branch, and
validate the same candidate SHA. It also inspects the external run in `0disoft/integration-lab`,
requires workflow `Clarissimi external consumer` on `main`, and checks that its display title names
the exact immutable Clarissimi ref. Source-only evidence defaults that ref to the candidate SHA.
Versioned Action evidence defaults it to the release version for direct helper calls, but an explicit
candidate SHA is accepted for pre-tag evidence. The helper also requires the full-write matrix to contain successful
Ubuntu, macOS, and Windows jobs with successful stage, approval, promotion, recognition
verification, and cleanup steps. It records only the secret name
`CLARISSIMI_PROVIDER_TOKEN`, never the secret value.

For the Action release authorized by ADR 0031, identify the immutable tag explicitly:

```powershell
pnpm run release-candidate-evidence-issue -- --release-type versioned-action-tag --release-version v0.1.0 --sha <candidate-sha> --ci-run <ci-run-id> --live-run <live-run-id> --external-run <external-run-id> --external-write-run <full-write-run-id> --provider-model <provider-model>
```

The helper rejects package-publication evidence while public packages remain blocked. A
source-only evidence issue may omit both release options.

For gateway providers, pass the same non-secret provider options used by hosted live-provider smoke:

```powershell
pnpm run release-candidate-evidence-issue -- --sha <candidate-sha> --ci-run <ci-run-id> --live-run <live-run-id> --external-run <external-run-id> --external-write-run <full-write-run-id> --provider-model minimax-m3 --provider-endpoint <chat-completions-url> --provider-thinking disabled
```

## Publication Decision

Before publication or a versioned Action tag, confirm:

- Public product positioning still rejects contributor scoring, ranking, tiers, and public
  leaderboards.
- Package manifests and Action metadata match the selected release decision.
- Rollback instructions in `docs/ops/rollback.md` still cover proposal branches, pull requests,
  recognition records, derived output rebuilds, and immutable Action tag recovery.
- Versioned Action releases use the exact immutable tag recorded in the evidence issue. A later
  `v0` promotion follows ADR 0034, verifies the expected commit independently, and does not move the
  immutable tag.
- The external consumer workflow passed for that exact immutable tag or commit SHA.
- The external full-write workflow passed stage, approval, promotion, recognition verification, and
  cleanup on Ubuntu, macOS, and Windows for that exact immutable ref.
- No evidence-only commit was created after final candidate validation solely to update recorded run
  URLs.
