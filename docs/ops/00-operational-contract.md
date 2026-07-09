# Operational Contract

- Status: Draft

## Operational Contract

Define critical user journeys, operational priorities, SLO, RTO, RPO, release blocking conditions, ownership, and dependency tiers.

Clarissimi is currently an open-source CLI and GitHub Action, not a hosted service. The operational
contract therefore protects repository state, generated recognition records, proposal branches,
GitHub Action behavior, and maintainer-controlled provider credentials.

Critical user journeys:

- A maintainer runs the CLI locally to stage, approve, import, or rebuild recognition records.
- A maintainer runs the Action in `dry-run`, `propose`, or `stage-draft` mode after safe
  post-merge events.
- A maintainer reviews generated proposal pull requests before public recognition lands.
- A maintainer runs release-only live provider smoke with their own provider credentials.

Operational priorities:

1. Do not publish unapproved, rejected, skipped, or raw AI/provider output as public recognition.
2. Do not leak tokens, private keys, raw diffs, raw provider responses, or sensitive evidence.
3. Do not mutate the default branch directly from write-mode automation.
4. Keep derived outputs rebuildable from `.clarissimi/contributions.jsonl`.
5. Keep release and dogfood gates reproducible through documented commands and workflow runs.

SLOs are local and repository-scoped:

- Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges.
- Recovery target: unsafe proposal branches or pull requests should be closed or deleted before
  further dogfood runs continue.
- Data durability target: approved recognition can be restored from Git history plus the canonical
  ledger file.

Dependency tiers:

| Tier | Dependency | Failure response |
| --- | --- | --- |
| Tier 0 | Git repository and `.clarissimi/contributions.jsonl` | Stop publication, restore or revert repository state. |
| Tier 1 | GitHub Actions, branch protection, proposal pull requests | Stop write-mode dogfood, use local validation until hosted checks recover. |
| Tier 2 | Provider APIs and maintainer-owned credentials | Disable live-provider smoke and use fake-provider correctness checks. |
| Tier 3 | Derived Markdown and static JSON outputs | Rebuild from the canonical ledger. |

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Current hosted live-provider evidence: workflow run `29018826925` passed on
  `2026-07-09T12:39:17Z` using repository secret `CLARISSIMI_PROVIDER_TOKEN`.
