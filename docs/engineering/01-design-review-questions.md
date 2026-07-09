# Design Review Questions

- Status: Draft

## Contract

Design review questions must cover problem boundary, ownership, data/state, failure and recovery,
future cost, and source-of-truth drift.

Before accepting a new Clarissimi feature, answer:

- Which product or ADR boundary authorizes the change?
- Which package owns the behavior, and which packages must not own it?
- Does the feature affect public recognition, draft inbox files, provider calls, GitHub API calls,
  or repository writes?
- What data crosses a trust boundary, and where is it validated or redacted?
- Can the behavior be tested with fixtures, fake clients, fake fetches, or temporary repositories?
- What is the rollback path if the feature writes unsafe output?
- Does the feature add public score, ranking, leaderboard, or tier language?
- Does the feature expose a contributor's recent share of total score, points, impact weight, or
  contribution weight in a public view?
- Does it change CLI flags, Action inputs or outputs, config fields, exit codes, or generated
  repository files?
- Does it require a release gate, dogfood workflow, or maintainer-owned credential?
- What future migration cost is introduced if the MVP shape changes later?

## Required Evidence

- Source of truth: `docs/product/02-spec.md`, `docs/adr/`, `docs/cli/`, `docs/github-action/`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run lint`, `pnpm run smoke`,
  `pnpm run check`, `pnpm run contract`
- Related checklist: `CHECKLIST.md`

## Review Blockers

- A change lacks an accepted product or ADR boundary.
- Ownership moves domain policy into CLI, Action, provider, or GitHub adapters.
- Failure and rollback behavior are undocumented for write-mode changes.
- A feature requires live credentials in correctness tests.
