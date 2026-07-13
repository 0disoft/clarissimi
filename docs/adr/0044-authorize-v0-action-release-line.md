# ADR 0044: Authorize the v0 Action Release Line

- Status: Accepted
- Date: 2026-07-13
- Owner: Repository maintainers

## Context

ADR 0031 authorized the first root Action release at `v0.1.0` and corrective `v0.1.x` patch tags.
Since that release, the root Action has gained bundled execution, approved-draft promotion, an
explicit direct-commit mode, bounded external requests, endpoint trust policy, contributor summary
presentation, and automation-contributor display. Keeping those additive contracts only on `main`
would make the moving development branch the sole usable distribution path.

The release documentation already describes immutable `v0.x.y` Action tags, but the evidence helper
still rejects versions outside `v0.1.x`. The evidence orchestrator also defaults a new versioned
release to its not-yet-created tag even though the release procedure requires evidence before tag
creation.

## Decision

- Authorize immutable root Action releases matching `v0.x.y` while the project remains in the `v0`
  compatibility line.
- Select `v0.2.0` as the next release candidate for the accumulated additive Action contracts.
- Every immutable release must pass the local release gates, hosted CI, hosted live-provider smoke,
  and external consumer dry-run and full-write smoke for the exact candidate commit.
- Before a new tag exists, versioned release evidence may use the exact candidate commit SHA as the
  immutable external consumer ref. The evidence record must name both the intended release version
  and the tested SHA.
- After the immutable tag and GitHub pre-release exist, external consumer smoke must run again using
  the exact tag. Moving alias `v0` may advance only after the immutable release passes those checks
  and the ADR 0034 compare-and-swap and rollback procedure.
- Root and workspace packages remain private at `0.0.0`. npm publication and GitHub Marketplace
  publication remain blocked.
- A future `v1` release, public package publication, or Marketplace publication requires a separate
  accepted decision.

## Consequences

Maintainers can publish meaningful additive Action releases without pretending they are corrective
`v0.1.x` patches or writing a new distribution ADR for every immutable `v0.x.y` tag. Pre-tag
evidence remains possible without creating a tag that has not yet earned release evidence. The
post-tag smoke still catches tag-resolution or consumer-startup failures before the moving alias is
advanced.

## Validation

- release evidence helper and orchestrator tests
- `docs`
- `release-readiness`
- `lint`
- `format`
- `smoke`
- `check`
- `contract`
- hosted CI for the exact release candidate SHA
- hosted live-provider and external consumer evidence for the candidate SHA
- post-tag external consumer verification before moving `v0`
