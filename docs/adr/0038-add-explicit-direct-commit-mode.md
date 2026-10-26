# ADR 0038: Add Explicit Direct Commit Mode

- Status: Accepted
- Date: 2026-07-12
- Owner: Repository maintainers

## Context

ADR 0008 keeps `propose` as the default write mode but reserves an explicit `commit` mode.
Maintainers increasingly review an automation goal, its bounded evidence, and validation results
instead of manually reviewing every generated line. For those repositories, a mandatory proposal
pull request adds a second approval ceremony after the maintainer has already selected an approved
or auto-approved recognition policy.

Direct default-branch writes have a larger blast radius than proposal branches. The feature must
make the opt-in unambiguous and keep validation, path ownership, concurrency, and rollback
deterministic rather than assuming a human will inspect every generated file.

## Decision

Add GitHub Action `mode: commit` as an explicit non-default write mode.

- `propose` remains the default.
- `commit` accepts the same merged pull request evidence and approved or auto-approved assessment
  boundary as `propose`.
- Provider, redaction, schema, policy, existing-ledger, duplicate, renderer, staged-file hash, and
  safe output-path checks complete before the commit is created.
- The checkout must be clean before repository output is written.
- When `GITHUB_SHA` is available, checkout HEAD must equal it before mutation.
- The Action writes only Clarissimi-owned public recognition outputs, creates one bot-authored
  commit, and pushes `HEAD` to the explicitly configured target branch.
- After commit hooks finish, every changed path must exactly match the staged output manifest.
  Direct and proposal writers share this ownership check and read NUL-delimited Git filenames
  without trimming. Rename detection is disabled so a rename's removed source path cannot hide
  behind its permitted destination. The check reuses the existing diff request and adds no Git
  subprocess or network call. A direct commit with extra paths fails with `unowned_commit_changes`
  before returning a publishable result; its local commit and checkout are preserved for inspection.
- Push uses normal fast-forward Git semantics and never force-pushes. A concurrent branch update or
  branch protection rejection fails the run.
- Before returning a publishable result, the committed tree must contain every manifest output
  as a regular-file blob with exactly the staged bytes. One literal-path, NUL-delimited `ls-tree`
  request obtains all output blob IDs. Staged files are rechecked against manifest byte counts and
  SHA-256 digests; their Git blob IDs are computed with the repository's SHA-1 or SHA-256 object
  format and compared to the actual commit. This detects equal-length content edits, missing
  outputs, and symlink substitutions without decoding or reading committed blob bodies.
- A post-hook mismatch fails with `committed_output_mismatch` and leaves the local commit for
  inspection, with no publishable result. Hooks and Git clean filters must preserve the staged
  bytes. The additional verification costs one Git subprocess and one staged read per output,
  with no external request. The same verifier is used by proposal creation and reuse.
- An unchanged deterministic rebuild creates and pushes no commit.
- Failed local writes restore only validated manifest paths in the index and worktree, using the
  same literal-path rollback helper as proposal mode. Newly created manifest files are removed;
  existing manifest files are restored from the captured base. Unrelated staged, unstaged, and
  untracked work remains untouched even if a hook or another process created it after the initial
  clean-checkout check. Manifest ownership and metadata are validated before mutation and rollback.
- Recovery never resets HEAD. If HEAD advanced before recovery (including a hook-created commit
  or a failure after creating the recognition commit), recovery reports `rollback_failed` and leaves
  the checkout intact for inspection rather than rewinding an unknown commit. Concurrent edits to
  manifest-owned files and externally switched checkouts are not covered by a transaction lock.
  A rejected unowned or content-mismatched commit retains its specific `unowned_commit_changes`
  or `committed_output_mismatch` diagnostic instead of entering recovery and hiding the violation
  behind a second HEAD-change error.
- `commit` requires `contents: write`; it does not require pull-request write permission.
- `commit` must not run on untrusted pull request head code or use `pull_request_target` as its
  default event path.

Explicit mode selection is maintainer authorization for this bounded mutation. It does not
authorize broader paths, force push, approval inference, provider-controlled Git arguments, or a
bypass of repository branch protection.

## Consequences

- Small or automation-first repositories can remove the proposal and merge round trip.
- GitHub branch protection remains the repository owner's final enforcement boundary.
- Failed pushes may leave the new commit only in the disposable runner checkout; rerunning from the
  current target branch safely rebuilds the same ledger state.
- Recovery after a successful push is a normal revert of the generated recognition commit followed
  by a deterministic rebuild from the canonical ledger.
- `v0.1.1` remains immutable. Advertising this mode from a versioned Action tag requires a later
  immutable release and external full-write consumer smoke.

## Validation

- direct writer tests for clean checkout, expected HEAD, deterministic commit metadata, and owned
  output paths
- direct publisher tests for successful fast-forward push, changed HEAD rejection, and concurrent
  non-fast-forward rejection
- Action environment tests for explicit mode selection, bounded outputs, and missing token failure
- repository `format`, `lint`, `test`, `docs`, `smoke`, `check`, `contract`, bundle freshness, and
  release-readiness gates
