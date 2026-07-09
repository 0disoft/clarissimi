# ADR 0004: Do Not Ship a Public Leaderboard

- Status: Accepted
- Date: 2026-07-08

## Context

Open-source recognition is social and trust-based. Public scores and rankings can distort
contributor behavior, invite gaming, and make contributors feel judged instead of appreciated.

## Decision

Clarissimi will not ship a public total-score leaderboard or contributor ranking as a default
feature.

Clarissimi will also not expose a public "share of contribution score" metric, such as the
percentage of all recent contribution weight attributed to one contributor over the last 90 days.
Even when phrased as a ratio instead of a rank, that metric turns recognition into a competitive
scoreboard.

Maintainer-only analytics may later compute time-windowed recognition mix or review workload
signals, but they must be opt-in, clearly marked as internal, and kept out of public recognition
records, `CONTRIBUTORS.md`, default static site data, badges, and public profile summaries unless a
future ADR accepts a safer public presentation.

## Consequences

- Public output focuses on contribution narratives, badges, areas, and release thanks.
- Internal impact weight may exist for sorting and policy but must not be exposed as a contributor
  score.
- Public contributor profiles must not show recent share of total impact weight, contribution
  weight, score, points, or leaderboard-like ratios.
- README and UI language must use recognition, evidence, and maintainer approval vocabulary.
