# Release Candidate Evidence

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

## Evidence Issue Helper

After hosted CI and hosted live-provider smoke pass for the same candidate SHA, create or preview a
release evidence issue from the run metadata:

```powershell
pnpm run release-candidate-evidence-issue -- --sha <candidate-sha> --ci-run <ci-run-id> --live-run <live-run-id> --provider-model <provider-model>
```

Use `--print` to preview the issue body without creating a public GitHub issue. The helper validates
that both run IDs completed successfully, match the selected branch, and validate the same candidate
SHA. It records only the secret name `CLARISSIMI_PROVIDER_TOKEN`, never the secret value.

For gateway providers, pass the same non-secret provider options used by hosted live-provider smoke:

```powershell
pnpm run release-candidate-evidence-issue -- --sha <candidate-sha> --ci-run <ci-run-id> --live-run <live-run-id> --provider-model minimax-m3 --provider-endpoint <chat-completions-url> --provider-thinking disabled
```

## Publication Decision

Before publication or a versioned Action tag, confirm:

- Public product positioning still rejects contributor scoring, ranking, tiers, and public
  leaderboards.
- Package manifests and Action metadata match the selected release decision.
- Rollback instructions in `docs/ops/rollback.md` still cover proposal branches, pull requests,
  recognition records, and derived output rebuilds.
- No evidence-only commit was created after final candidate validation solely to update recorded run
  URLs.
