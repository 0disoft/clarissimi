# Backup and Restore

- Status: Draft

## Operational Contract

Focus on restore, including restore owner, schedule, test cadence, RTO, RPO, integrity checks, and partial restore behavior.

Clarissimi has no external database in the MVP. Backup and restore are Git-based:

- canonical approved ledger: `.clarissimi/contributions.jsonl`
- derived public files: `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, and future static data
- review inbox files: `.clarissimi/drafts/*.json`
- operational evidence: GitHub workflow runs and proposal pull requests

Restore expectations:

- Restore canonical ledger records from Git history or a reviewed revert commit.
- Rebuild derived outputs with `clarissimi rebuild --out-dir .` after ledger restoration.
- Delete or close unsafe proposal branches and pull requests rather than treating them as backups.
- Do not restore raw provider responses, raw diffs, or draft provenance into public output files.

RTO and RPO are repository-scoped:

- RTO: one maintainer session to revert or close unsafe recognition state.
- RPO: last pushed Git commit for canonical repository files.
- Partial restore: restore the ledger first, then rebuild derived files.

Integrity checks after restore:

- `clarissimi validate-ledger`
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- secret scan for committed provider tokens, GitHub tokens, private keys, and environment files

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
