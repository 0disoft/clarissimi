# Project Invariants

- Status: Draft

## Contract

Project invariants define what must remain true across implementation, tests, docs, configuration,
and release behavior.

Clarissimi's non-negotiable invariants are:

- AI drafts recognition; maintainers approve public recognition.
- Public output must not expose contributor scores, ranks, leaderboards, or contributor tiers.
- Raw evidence, raw provider responses, raw diffs, patch excerpts, tokens, private keys, and
  sensitive evidence must not appear in public outputs, CLI JSON, Action summaries, proposal pull
  request bodies, or committed generated files.
- Provider input crosses the redaction boundary before any live provider call.
- The canonical approved ledger is `.clarissimi/contributions.jsonl`.
- Derived contributor JSON, Markdown, and static data must be rebuildable from approved ledger
  records.
- Write-mode automation must not mutate the default branch directly.
- Correctness tests use deterministic providers, injected clients, fake fetches, fixtures, or
  temporary repositories instead of live credentials.
- Live provider smoke is explicit, credentialed, and release-only.

## Required Evidence

- Source of truth: `docs/product/02-spec.md`, `docs/adr/`, `docs/monorepo/package-ownership.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`
- Related checklist: `CHECKLIST.md`

## Review Blockers

- A change bypasses the source of truth.
- A change weakens validation or hides skipped checks.
- A change publishes unapproved recognition.
- A change stores provider provenance, raw evidence, or secrets in public output.
- A change relies on generated, cache, or build output as source truth.
