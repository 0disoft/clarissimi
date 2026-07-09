# ADR 0026: Add Maintainer Recent Share Analytics

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

Maintainers may want to understand how much of the recently approved recognition activity came
from a contributor during a release cycle or recent maintenance window. This can be useful for
thank-you notes, release retrospectives, and spotting contributors whose work should not be missed.

The same metric is risky in public output. A contributor's share of recent impact or contribution
weight can read like a soft leaderboard even without a rank column. Clarissimi's product contract
still prioritizes recognition narratives over scoreboards.

## Decision

Add a maintainer-only recent recognition share analytics surface.

The MVP analytics surface:

- reads the approved ledger through existing renderer validation
- defaults to a 90-day window
- allows an explicit `asOf` timestamp for reproducible local reports
- maps `impactLevel` to an internal recognition weight only for this analytics calculation
- reports each contributor's share of the selected window's total recognition weight
- writes no repository files
- is not included in `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, or static public JSON

The initial CLI command is:

```text
clarissimi analytics recent-share [--ledger <path>] [--window-days <days>] [--as-of <iso-date>] [--json]
```

The command is for maintainer review. It must not become a public default output, a sort key for
public contributor pages, or a replacement for evidence-backed recognition text.

## Consequences

Maintainers can inspect recent contribution concentration without changing the public recognition
contract. Public renderers continue to exclude scores, ranks, percentages, and share fields.

If Clarissimi later wants to publish a softer version of this information, it needs a new ADR with a
public framing that does not create ranking pressure.

## Validation

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
