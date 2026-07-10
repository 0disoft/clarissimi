# ADR 0034: Add the v0 Major Action Alias

- Status: Accepted
- Owner: Repository maintainers

## Context

ADR 0031 intentionally shipped the first Action only at immutable tag `v0.1.0`. Clarissimi has
since published immutable patch tag `v0.1.1`, bundled the Action runtime, and passed external
dry-run and cleanup-safe full-write smoke on Ubuntu, macOS, and Windows. Consumers can pin an exact
patch tag, but they cannot opt into compatible `0.x` updates without editing every workflow.

A moving major alias is convenient but is also a mutable supply-chain pointer. Treating `v0` like
an ordinary release tag would hide that risk and could move consumers to a commit that did not pass
the same release evidence as its immutable patch tag.

## Decision

Clarissimi provides moving Action alias `v0` under these constraints:

- Immutable tags such as `v0.1.0` and `v0.1.1` never move.
- `v0` may point only to the exact commit of an existing immutable `v0.x.y` tag with a non-draft
  GitHub Release.
- Maintainers select the target version explicitly. Automation must not infer the newest tag.
- The selected immutable tag must already have the local, hosted CI, hosted live-provider, external
  dry-run, and external full-write evidence required by `docs/ops/release.md`.
- Before moving an existing alias, record its current SHA. Push with a lease or another
  compare-and-swap guard so concurrent changes fail instead of being overwritten.
- After creation or movement, `pnpm run verify-action-major-tag` must prove that `v0`, the selected
  immutable tag, and its GitHub Release identify the expected commit.
- External dry-run and full-write workflows must run with `clarissimi-ref=v0` and an explicit
  `expected-sha`. Every runner verifies the checked-out Action commit before executing it.
- A failed post-move verification rolls `v0` back to the recorded previous SHA. If no previous
  alias existed, delete only the newly created `v0` alias. Immutable version tags and releases are
  not changed by alias rollback.

Consumers that require reproducibility or dependency-review stability should continue pinning an
immutable patch tag or commit SHA. `v0` is an opt-in compatibility channel, not an immutable release.

Root and workspace packages remain private at `0.0.0`. npm publication and GitHub Marketplace
publication remain blocked.

## Consequences

Typical consumer workflows can use `0disoft/clarissimi@v0` and receive maintainer-approved `0.x`
Action updates. Exact patch tags remain available for audit and rollback. Alias promotion adds a
deliberate post-release operation and requires external verification because a successful tag push
alone does not prove that consumers resolved the intended commit.

## Validation

- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- `pnpm run verify-action-major-tag -- --release-version <v0.x.y> --sha <commit-sha>`
- external dry-run and full-write smoke for `v0` with the same expected SHA on Ubuntu, macOS, and
  Windows
- read-only orphan audit after full-write smoke
