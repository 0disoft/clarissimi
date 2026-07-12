# Rollback

- Status: Draft

## Operational Contract

Provide a short actionable decision tree with triggers, procedure, database rollback policy, validation, owners, and forward-fix criteria.

Clarissimi currently has no service database, external migration, or hosted runtime in the MVP.
Rollback is repository-state cleanup for generated recognition files, proposal branches, and
proposal pull requests.

## Decision Tree

Stop the current release, dogfood run, or source-only merge when any of these happen:

- `propose` mode writes outside Clarissimi-owned output paths.
- A proposal pull request contains raw evidence, provider raw output, secrets, raw diffs, or patch
  excerpts.
- The proposal branch mutates the default branch or cannot prove its base commit.
- `commit` mode writes outside Clarissimi-owned outputs, starts from a dirty or unexpected HEAD, or
  attempts a force push.
- The Action uses broader permissions than `docs/github-action/permissions.md` allows.
- `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`, `pnpm run smoke`,
  `pnpm run check`, `pnpm run contract`, `actionlint`, `ssealed doctor . --json`, YAML parsing,
  secret scan, or repository hygiene checks fail.

Choose the narrowest rollback path:

| State                                                                 | Rollback action                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Temporary staging output only                                         | Delete the temporary staging directory.                                                                                        |
| Local proposal branch only                                            | Delete the local `clarissimi/recognition/<source-kind>-<source-id>` branch.                                                    |
| Published proposal branch without pull request                        | Delete the remote proposal branch.                                                                                             |
| Open proposal pull request before merge                               | Close the proposal pull request and delete the proposal branch.                                                                |
| Failed integration-lab full-write smoke leaves run-scoped resources   | Preview `pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>`, apply it explicitly, then rerun the orphan audit. |
| Merged recognition pull request                                       | Revert the recognition pull request and run the rebuild path for derived outputs.                                              |
| Published direct recognition commit                                   | Revert the exact Clarissimi commit and run the rebuild path for derived outputs.                                               |
| Published Action tag with a normal defect                             | Keep the tag immutable and publish a corrective patch tag.                                                                     |
| Moving `v0` alias fails verification                                  | Restore the recorded previous SHA with a lease, or delete only a newly created alias.                                          |
| Published Action tag with an urgent security or supply-chain incident | Document impact and recovery, then delete or replace the tag only when continued availability is more dangerous.               |

## Procedure

For temporary staging output, delete only the configured staging directory. The default Action path
is under `RUNNER_TEMP` and must not be treated as source truth.

For a local proposal branch:

```powershell
git branch --delete clarissimi/recognition/<source-kind>-<source-id>
```

Use `--delete` first. Use forced deletion only after confirming the branch contains no maintainer
edits that need to be preserved.

For a published proposal branch:

```powershell
git push origin --delete clarissimi/recognition/<source-kind>-<source-id>
```

For an open proposal pull request, close the pull request first, then delete the remote branch. The
pull request title starts with `Clarissimi recognition:` and the branch is scoped under
`clarissimi/recognition/`.

For integration-lab full-write smoke residue, do not delete broad `clarissimi/*` patterns. Run
`pnpm run release-evidence-cleanup -- --run-id <full-write-run-id>` first and inspect its JSON
preview. The tool verifies that the run is a completed `Clarissimi full write smoke` dispatch and
matches only the exact run-scoped base, draft, and recognition branches. Add `--apply` only after
reviewing that list. The command attempts every bounded cleanup action, reads repository state
again, and fails if any matched pull request or branch remains. Finish by rerunning the read-only
`Clarissimi smoke orphan audit` workflow.

For a merged recognition pull request, revert the merge or the exact recognition commit with the
repository's normal GitHub workflow. After the revert lands, regenerate derived outputs with the
configured rebuild command and rerun validation.

For a published Action tag with a normal defect, do not move or overwrite the existing tag. Stop
promoting the affected version, document the defect in the release notes, fix and validate a new
candidate, and publish the next patch tag such as `v0.1.1`.

For a failed `v0` alias promotion, keep the selected immutable version tag and GitHub Release
unchanged. Restore `v0` to the SHA recorded before promotion using a compare-and-swap lease. If no
alias existed before the failed promotion, delete only `v0`. Rerun the read-only major-tag verifier
and external consumer smoke against the restored state.

For an urgent security or supply-chain incident, first preserve the affected tag name, old SHA,
workflow evidence, and release URL in an incident issue. Delete or replace the remote tag only when
leaving it available creates greater user risk. Publish a replacement tag or recovery instruction,
and name the old SHA, replacement SHA, affected users, and verification evidence.

## Database Rollback Policy

No database rollback exists in the MVP. The canonical state is repository files:

- `.clarissimi/contributions.jsonl`
- `.clarissimi/contributors.json`
- `CONTRIBUTORS.md`
- future static data files generated from approved recognition records

Derived files should be regenerated from approved contribution records instead of hand-edited during
rollback.

## Forward-Fix Criteria

Resume the release or dogfood run only after:

- the unsafe proposal branch or pull request is closed, deleted, reverted, or replaced
- generated recognition files contain only approved or auto-approved public records
- no raw evidence, provider raw output, secrets, raw diffs, or patch excerpts appear in public
  output, Action output, step summary, branch metadata, or pull request body
- required validations pass again

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`
- Release status: versioned Action tags are allowed by ADR 0031 after release gates pass; public
  package publication remains blocked by `docs/ops/release.md`.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
