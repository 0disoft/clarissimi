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
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- secret scan for committed provider tokens, GitHub tokens, private keys, and environment files

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`
- Release status: versioned Action tags are allowed by ADR 0031 after release gates pass; workspace
  packages remain private, and standalone CLI publication follows the manual ADR 0056 gates.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
