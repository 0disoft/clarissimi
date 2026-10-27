# ADR 0062: Authorize the Stable Action Release and the CLI 1.x Compatibility Line

- Status: Accepted
- Date: 2026-10-10
- Owner: Repository maintainers

## Context

The `v0` Action line is published and externally validated. Immutable `v0.7.0` and the standalone
npm CLI `clarissimi@0.2.0` both shipped the approved-draft, public-output, reviewer-permission, and
claim-to-evidence safeguards, and a further batch of correctness and usability fixes has landed on
the default branch since. ADR 0055 selected `v1.0.0` as the first stable root Action candidate and
defined the Action compatibility boundary, but it intentionally does not authorize publication.
ADR 0056 defines the standalone CLI distribution and its npm gates, but it does not state the
compatibility promise that CLI consumers should expect across the `1.x` line.

The Action, the standalone CLI, and the persisted assessment schema change for different reasons
and retain independent release numbers. Coupling them, or restating the ADR 0055 Action boundary here,
would either delay the stable Action or suggest CLI guarantees the repository does not make.

## Decision

Clarissimi authorizes the first stable root GitHub Action release `v1.0.0` and the standalone CLI
`clarissimi@1.0.0`, subject to the release gates below. This ADR records the authorization and the
CLI compatibility contract; it does not create a tag, move an alias, publish a package, or claim
that external validation has already passed.

- The root Action compatibility boundary is the one already accepted by ADR 0055. This ADR does not
  restate, weaken, or replace it; the `v1.0.0` Action release inherits that boundary unchanged.
- Release versions stay independent. The Action release line, the CLI package version, and the
  persisted `clarissimi.assessment/v1` schema identifier keep their own cadence. A `v1.0.0` Action
  or a `1.0.0` CLI package does not renumber the data schema.
- The standalone CLI `1.x` line is backward compatible for existing consumers. Throughout `1.x`:
  - every existing command and every existing option keeps its current name and meaning;
  - documented JSON success and failure keys keep their names and value types, and the documented
    exit-code meanings stay stable;
  - the accepted configuration file names, fields, and value ranges stay stable;
  - every persisted assessment and ledger version registered at CLI `1.0.0` remains readable.
- A `1.x.y` release may add optional commands, options, JSON fields, or capabilities. It must not
  remove or rename a documented command, option, JSON key, or config field, make a formerly optional
  input required, change a documented exit meaning, or invalidate a registered ledger. New persisted
  schemas need adjacent deterministic migrations and compatibility fixtures while retaining readers
  for every registered version.
- Removing a documented contract or changing its meaning requires a new CLI major version. Private
  workspace packages remain private at `0.0.0`; only `distribution/npm/clarissimi` is a publication
  surface, and root and `packages/*` manifests stay unpublished.
- Human-facing prose, help text, and diagnostics are not byte-stable. Their wording may improve in a
  patch release as long as the machine-readable contract above is preserved.
- Immutable `v1.x.y` tags never move. Alias `v1` may point only to one already-published, stable
  immutable `v1.x.y` release at the same verified commit, using the ADR 0034 compare-and-swap,
  exact-SHA, post-promotion verification, and rollback boundaries. Existing `v0.x.y` tags and alias
  `v0` are preserved; no fixed `v0` support duration is promised.
- npm publication keeps the ADR 0056 contract unchanged. Trusted publishing submits a staged package
  over OIDC with `npm stage publish` only. A staged version is not public until a maintainer inspects
  it and approves it with their own two-factor authentication. This ADR does not relax, bypass, or
  automate that stage-only, maintainer-approved authentication boundary.
- Publication remains gated. The exact `v1.0.0` Action candidate and the exact CLI `1.0.0` build
  must each pass their local, hosted, and external gates before any tag, alias, or registry action.

## Compatible Patch Candidate

On 2026-10-26, Action `v1.0.1` and standalone CLI `clarissimi@1.0.1` are selected
as compatible patch candidates for credential redaction, bounded redaction scans, CLI generation
rollback, and reduced ledger reads. Existing Action and CLI signatures, permissions, defaults,
persisted schemas, and private workspace versions remain unchanged. Publication and alias promotion
still require the exact-source evidence and npm maintainer approval described above.

## Compatible 1.1.0 Candidate

On 2026-10-27, Action `v1.1.0` and standalone CLI `clarissimi@1.1.0` are selected
for the additive live-PR collection and hash-bound batch-review commands, contributor-candidate
discovery, and accumulated redaction, publication-integrity, output-isolation, and performance
fixes. Existing command names, Action inputs and outputs, permissions, defaults, and persisted
schemas remain compatible. All exact-source publication gates and npm maintainer approval remain
required. Consumer workflows may intentionally follow the supported moving `v1` channel.

## Consequences

Action consumers gain a stable major contract, and CLI consumers gain an explicit `1.x` compatibility
promise instead of inferring one. The two artifacts can still ship on separate schedules, and the
persisted schema keeps its identity. The release cannot happen by accident: this decision only
authorizes preparation, and every candidate still needs fresh exact-SHA evidence.

Rollback never moves or deletes an immutable version tag and never republishes an npm version. If a
first-time `v1` alias verification fails, delete only the newly created alias with a compare-and-swap
lease; if a later promotion fails, restore the previously recorded alias SHA. Leave `v0`, its
immutable tags, and persisted ledger data unchanged.

## Validation

- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run migration-check`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- CLI compatibility checks for documented commands, options, JSON keys and types, exit codes, config
  fields, and registered ledger versions
- `pnpm run verify:cli-package` for the exact CLI candidate
- exact-SHA hosted CI, hosted live-provider smoke, external dry-run, full-write, cleanup, and
  orphan-audit evidence for the final `v1.0.0` Action candidate
- post-tag, Marketplace, and compare-and-swap `v1` alias validation after release
- a staged npm `1.0.0` review with maintainer two-factor approval and a post-publication install in
  an empty external repository
