# ADR 0045: Publish the Root Action to GitHub Marketplace

- Status: Accepted
- Date: 2026-07-13
- Owner: Repository maintainers

## Context

Clarissimi already distributes one root GitHub Action through immutable `v0.x.y` tags and the
moving `v0` compatibility alias. The release line now has local validation, hosted CI, a live
provider smoke, an external consumer dry-run matrix, a full-write matrix, orphan cleanup auditing,
and compare-and-swap alias rollback. Keeping the Action absent from GitHub Marketplace makes the
supported distribution harder to discover without reducing any runtime risk.

Marketplace publication is a distribution decision, not package publication. The root and
workspace npm packages still have no public versioning, registry authentication, provenance,
rollback, or support contract.

## Decision

- Authorize the root `action.yml` Action for free GitHub Marketplace publication.
- Select `v0.3.0` as the first Marketplace release and publish it as a non-draft, non-prerelease
  GitHub Release after exact-candidate evidence passes.
- Keep `Clarissimi` as the Marketplace action name. A pre-publication Marketplace search must find
  no existing Action using that name, and GitHub's release form must accept the metadata.
- Add Marketplace branding with the supported Feather `award` icon and `purple` color.
- Use `Code review` as the primary category and `Utilities` as the secondary category because the
  Action turns merged contribution evidence into maintainer-reviewed repository output.
- Marketplace publication remains an interactive GitHub release setting. The repository records
  the decision, metadata, evidence, rollback, and verification contract; it does not pretend the
  Marketplace checkbox is a portable CLI operation.
- Future Marketplace releases must use immutable `v0.x.y` tags, exact-SHA hosted evidence, and a
  non-prerelease GitHub Release. Moving `v0` remains a separate ADR 0034 promotion.
- Root and workspace packages remain private at `0.0.0`. npm publication remains blocked.

## Rollback

Unlisting Clarissimi from Marketplace must not delete or move an immutable release tag. A
maintainer may edit the affected GitHub Release and clear its Marketplace publication setting,
record the reason publicly, and leave existing tag consumers reproducible. A defective Action is
corrected with a new immutable patch or minor release; `v0` moves only after the corrective release
passes the normal alias gates.

## Consequences

Clarissimi becomes discoverable through GitHub's Action catalog without adding a hosted service or
publishing internal packages. Marketplace developer-agreement acceptance, category selection, and
the final publication toggle remain GitHub-owned account state and require public verification
after the repository-owned release succeeds.

## Validation

- root `action.yml` metadata parse and release-readiness contract
- release publisher tests for prerelease and stable release kinds
- release evidence tests for Marketplace distribution wording
- local `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, and
  `contract`
- hosted CI, hosted live-provider smoke, and external dry-run/full-write matrices for the exact
  `v0.3.0` candidate
- post-tag evidence, Marketplace page verification, and ADR 0034 `v0` promotion
