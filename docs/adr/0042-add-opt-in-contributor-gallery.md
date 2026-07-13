# ADR 0042: Add an Opt-In Contributor Gallery

- Status: Accepted
- Date: 2026-07-13
- Owner: Repository maintainers

## Context

Clarissimi already renders evidence-linked contributor details and an optional count table in
`CONTRIBUTORS.md`. Maintainers may also want a compact visual acknowledgement similar to contributor
galleries used by other open source projects, without turning recognition into a leaderboard or
replacing the evidence that explains each contribution.

Generating or rewriting a repository README would create a broad ownership and merge-conflict
surface. Depending on an external gallery service or committing downloaded avatar files would also
add availability, privacy, and generated-asset maintenance costs.

## Decision

- Add `gallery` to the existing `markdownSummary` presentation vocabulary alongside `none` and
  `table`.
- `gallery` renders a `Contributor gallery` section before the existing evidence-linked contributor
  details in `CONTRIBUTORS.md`.
- Each gallery item is a linked HTML image with an accessible alt label. The link targets the
  contributor's validated GitHub profile URL.
- Avatar URLs use the stable GitHub contributor id at
  `https://avatars.githubusercontent.com/u/<id>?s=64&v=4`, not the mutable login.
- Gallery order reuses the deterministic contributor-profile order and must not sort by
  contribution count, impact, score, share, rank, or tier.
- The renderer escapes every HTML attribute and percent-encodes the contributor id before placing
  values in generated markup.
- The gallery is opt-in. `none` remains the default, and `table` remains available as the alternate
  compact summary.
- Clarissimi does not edit README files in this milestone. Maintainers may link to
  `CONTRIBUTORS.md` manually.

## Consequences

- Maintainers can add a visual contributor wall without losing recognition details or evidence
  links.
- Viewing a gallery makes one avatar request to GitHub's avatar host per contributor. Large
  galleries therefore increase page network requests and remain opt-in.
- GitHub controls avatar availability and rendering. Deleted accounts or unavailable avatar
  resources may display broken images while the text details remain usable.
- The generated markup uses only GitHub-supported image and link HTML and does not depend on custom
  CSS for circular cropping.

## Validation

- renderer tests for stable id-based avatar URLs, deterministic placement, attribute escaping, and
  preserved details
- schema, CLI, config, and Action tests for the `gallery` vocabulary
- Action bundle freshness and manifest validation
- repository `format`, `lint`, `test`, `smoke`, `check`, and `contract` gates
