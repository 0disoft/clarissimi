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
- The Action uses broader permissions than `docs/github-action/permissions.md` allows.
- `pnpm run docs`, `pnpm run smoke`, `pnpm run check`, `pnpm run contract`, `actionlint`,
  `ssealed doctor . --json`, YAML parsing, secret scan, or repository hygiene checks fail.

Choose the narrowest rollback path:

| State | Rollback action |
| --- | --- |
| Temporary staging output only | Delete the temporary staging directory. |
| Local proposal branch only | Delete the local `clarissimi/recognition/<source-kind>-<source-id>` branch. |
| Published proposal branch without pull request | Delete the remote proposal branch. |
| Open proposal pull request before merge | Close the proposal pull request and delete the proposal branch. |
| Merged recognition pull request | Revert the recognition pull request and run the rebuild path for derived outputs. |

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

For a merged recognition pull request, revert the merge or the exact recognition commit with the
repository's normal GitHub workflow. After the revert lands, regenerate derived outputs with the
configured rebuild command and rerun validation.

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

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Current hosted live-provider evidence: workflow run `29018826925` passed on
  `2026-07-09T12:39:17Z` using repository secret `CLARISSIMI_PROVIDER_TOKEN`.
