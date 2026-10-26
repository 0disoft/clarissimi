# Validation

## 2026-10-27 Complete authorization credential masking

The generic assignment matcher treated the first whitespace-delimited word as the entire value.
Consequently, plain Basic/Bearer headers were not masked (their scheme names are under eight
characters), while Negotiate lost only its scheme and retained its credential. All three reproduced
forms retained a non-credential marker in prepared provider evidence. A same-line scheme-aware
Authorization/Proxy-Authorization rule now runs before generic/token rules and masks the credential
with its scheme. ADR 0010 records this boundary; general value thresholds and report kinds remain
unchanged.

Comparing original HEAD redaction with the new code on the same 96 inputs (three schemes, four
header spellings, two assignment separators, four quote forms) reduced retained markers from
72/96 to 0/96. Six added regressions cover those forms and exact occurrence offsets, short and
truncated values, quoted-value preservation, unrelated fields and following lines, a child-process
deadline for 131,072-space unterminated values, core preparation/repository-visible rejection,
and the actual request body captured by an injected provider. All 193 redaction/core/provider
tests passed. Tests use only an explicit non-credential marker and make no external model calls.

No public API/schema, DB, dependency, or CI runner changes are introduced. The generated Action
runtime is refreshed to include the shared redaction rule. Hosted CI, live models, publishing,
and deployment are outside this local security change.

- `pnpm run check`: 1,063 tests, 1,059 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Indexed claim-to-evidence range lookup

Provider validation previously visited every field link for each claim-rule match and filtered
every field link again for each numeric sentence. Both paths now share a binary search over the
ordered, non-overlapping ranges guaranteed by schema-validated field coverage. ADR 0061 records
the lookup boundary. All overlapping segments, original issue indexes, strict endpoint comparisons,
and evidence support checks are preserved. Range lookup drops from O(C * L) to O(C log L + K),
where C is claim count, L is link count, and K is total overlaps visited; prose parsing and evidence
comparison costs are separate.

A synthetic assessment with 8,000 `"Latency is 5 ms."` sentences and one link per sentence in each
public field, all pointing to one `"Measured latency is 5 ms."` excerpt, occupies 1,584,577 UTF-8
bytes. The original HEAD validator and the updated validator ran in the same process with one
warm-up and three samples each. Before: 2548.91/3082.72/2039.80 ms; after: 291.16/227.35/247.12 ms.
Medians decreased from 2548.91 to 247.12 ms, about 10.3 times faster for this local fixture, not a
production latency guarantee. Three focused regressions compare lookup against the previous
linear predicate across boundaries, gaps, spanning queries, and uneven lengths, and cap endpoint
probes to logarithmic growth for 16,384 links. All 144 focused provider tests passed.
For a single overlap near the end of those 16,384 links, counted endpoint property reads decrease
from 32,767 for the original linear predicate to 16 for binary lookup.

No public API/schema, DB, dependency, repository layout policy, or CI runner changes are introduced.
The generated Action runtime is refreshed for the shared provider change. Hosted CI, live model
calls, publishing, and deployment are outside this local performance change.

- `pnpm run check`: 1,057 tests, 1,053 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Reuse numeric measurement parsing

Provider result validation previously reread and reparsed the same evidence body for every numeric
claim in both public fields. A per-validation, per-evidence checker now lazily parses measurement
sentences and reuses them. Sentence-local matching and the metadata/content boundary are preserved;
no cache survives a validation. ADR 0061 records the cache lifetime and matching boundary.

A local synthetic comparison against the original HEAD implementation used one 160,026-character
excerpt (`"Unrelated text. "` repeated 10,000 times followed by `"Measured latency is 5 ms. "`)
and 200 identical `"Latency is 5 ms."` claims in each public field. After one warm-up per version,
three samples measured 816.83/797.81/848.91 ms before and 9.37/9.93/8.83 ms after: medians
816.83 and 9.37 ms (about 87 times faster for this fixture). A counting getter verified 400 body
reads before and one after per validation. Evidence-body scans drop from O(claims * body length)
to O(body length); numeric-value comparison costs remain. This is a local synthetic result, not a
production latency guarantee. Five regressions cover matching/nonmatching/empty body reuse,
resumed parsing without cross-sentence support, and evidence changes between validations.

No public API/schema, DB, dependency, or runner changes are introduced. The generated Action runtime
is refreshed to include the shared provider change. Hosted CI, live model calls, publishing, and
deployment are outside this local performance change.

- `pnpm run check`: 1,054 tests, 1,050 passed, four POSIX permission tests skipped on Windows,
  zero failures. The focused provider suite passed all 141 tests.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Private-key armor format coverage

Encrypted PKCS #8 and OpenPGP private-key armor previously passed through redaction in both complete
and incomplete form; all four reproduced cases retained the non-key test payload in prepared
provider evidence. Both boundary patterns now share a label vocabulary covering the two omitted
formats. ADR 0010 records the standard labels and scope. Eight new tests cover complete/incomplete
blocks, mixed formats, public-key/certificate preservation, provider preparation, excerpt truncation,
and repository-visible rejection. All 46 focused redaction/core/collector tests passed. The existing
16,384-header child-process deadline guard also covers both new formats. Tests use only non-key
content; no credentials or cryptographic key material were generated. API shapes, DB, and runners
are unchanged.

- `pnpm run check`: 1,049 tests, 1,045 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.
- Hosted CI, live model calls, publishing, and deployment were not run for this local fix.

## 2026-10-26 Bounded assessment nesting

The recursive public-score inspection previously threw `RangeError` for 6,000-level JSON, including
a model-produced malformed `affectedArea` under 13 KiB. Assessment validation now stops at the first
value deeper than 64 levels below the root and returns `assessment_nesting_limit`; the external
provider maps this to its existing typed `invalid_assessment` error. ADR 0009 records the limit.
Five added regressions cover deep arrays/objects, the 64/65 boundary, score rejection within the
limit, and the provider response path. All 164 schema/provider tests passed. No dependency,
database, or runner changes are introduced; the new depth bound is an input-validation constraint.

- `pnpm run check`: 1,041 tests, 1,037 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action runtime regenerated and its bundle freshness check passed.
- Hosted CI, live model calls, publication, and deployment were not run for this local fix.

## 2026-10-26 Measurement content excludes evidence metadata

Numeric support now reads only `excerpt` and `text`; titles and filenames still identify candidates
but cannot supply measurement context or values. Before the fix, eight unsupported cases passed,
including a filename produced by the real GitHub collector, and two supported body-content cases
were rejected because titles contaminated the comparison. All eleven added boundary cases and the
41 existing numeric cases now pass. ADR 0061 records the content/metadata boundary. No additional
filesystem or network calls, public schema changes, or runner changes are introduced.

- `pnpm run check`: 1,036 tests, 1,032 passed, four POSIX permission tests skipped on Windows,
  zero failures. All 52 numeric performance tests passed.
- Lint, formatting, and CLI smoke validation: passed.
- Action bundle regenerated and freshness verified; release-readiness static gates: passed.
- Hosted CI, external model calls, publication, and deployment were not run for this local fix.

## 2026-10-26 Numeric measurement change direction

Seventeen newly added counterexamples reproduced false acceptance of reversed, negated, ambiguous,
or absolute-versus-change numeric performance support before the fix. The numeric regression suite
now covers these cases, valid English/Korean changes, separate metric clauses, and an unbound value
after a conjunction. The provider boundary compares change direction in addition to metric, value,
and unit, without extra network or filesystem calls. ADR 0061 records the conservative support rule.
Public schemas, approval policy, database state, dependencies, and CI runners are unchanged.

- `pnpm run check`: 1,025 tests, 1,021 passed, four POSIX permission tests skipped on Windows,
  zero failures. This includes all 41 numeric performance cases.
- `pnpm run lint`, `pnpm run format`, and documentation validation: passed.
- Action bundle regenerated; freshness and release-readiness static gates: passed.
- Hosted CI, external model calls, publishing, and deployment were not run for this local fix.

## 2026-10-26 Feedback improvements and CI reuse

All five feedback slices are implemented in local commits: collector redaction, numeric claim
support, selected live PR/batch review, additional contributor candidates, and CI build reuse.
No version, remote branch, tag, npm package, or deployed Action has been changed by this work.

- `pnpm run check`: 1,001 tests, 997 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- `pnpm run lint` and `pnpm run format`: passed.
- `node scripts/release-readiness.mjs`: passed, including docs, secret scan, Action bundle
  freshness, workflow/YAML checks, whitespace and generated-output guards.
- Direct compiled-script CI paths passed: `migration-check.mjs`, both benchmark guards,
  `verify-standalone-cli-package.mjs`, and `smoke.mjs`.
- CI contract tests: all 132 passed; `actionlint .github/workflows/ci.yml` passed.
- Actual public PR `0disoft/clarissimi#9` collected successfully in read-only CLI mode with the
  deterministic provider. No external model call was needed.

CI reuses compiled outputs for five subsequent consumers and performs documentation validation
inside release readiness only. TypeScript compiler invocations decrease from eight to three;
the full test suite still runs once. Permissions, runner count and required job identity are
preserved. Hosted Linux/macOS runs and new public releases were not dispatched in this local task.

Updated sources of truth: ADRs 0006, 0010, 0018, 0061, 0063 and 0064; CLI README and command
contract; monorepo package ownership; and the CI operational contract.

## 2026-10-26 Additional contributor candidates

Live CLI collection now suggests reviewers and linked-issue reporters by stable GitHub account ID
with evidence links, without assigning credit. Seven new GitHub discovery/transport/date cases and
the CLI candidate/staging case pass; the focused GitHub/live-CLI suite passed all 64 tests. Limits,
inaccessible APIs, pending/deleted actors, account renames, and long-key redaction in fetched review
and issue bodies are covered. Existing Action clients keep candidate API calls opt-in. Build and
lint pass; shared Action runtime was regenerated for the collector additions.

An actual read-only CLI run against `0disoft/clarissimi#9` succeeded with the deterministic provider:
11 changed files, one additional candidate, zero reported omissions or unavailable issue lookups.
That run uncovered and fixed GitHub REST UTC timestamps lacking milliseconds before shared source
validation. No external model call or repository write was involved in this live dry-run.

## 2026-10-26 Live CLI and batch review

Added selected real PR collection, explicit staging, optional partial-file coverage, and one-step
hash-bound batch approval/import under existing ledger locks. Shared output planning/options were
extracted without changing the single-draft path. Build and lint pass; all 16 new CLI integration
cases pass, including two-PR publication, stale draft/manifest refusal, duplicate/overlap rejection,
partial evidence reporting, and exclusive staging. The complete GitHub/CLI suite had 347 cases:
343 passed and four POSIX permission cases were skipped on Windows.
These are source-only additions; the published 1.0.1 CLI remains unchanged.

## 2026-10-26 Numeric performance evidence

English and Korean numeric performance claims now require matching linked measurement content;
benchmark paths alone do not support numeric results. The provider suite passed all 100 tests,
including 17 numeric cases and three scrubbed review reproductions promoted into the dirty corpus.
The balanced 28-case synthetic golden corpus is unchanged. Unit conversion and inferred arithmetic
are intentionally left for maintainer review. The Action bundle was regenerated.

## 2026-10-26 Collector redaction boundary

Collector excerpts now redact before normalization and truncation, including incomplete private
keys through end-of-input. Early redaction reports survive provider preparation. The focused
redaction, core, GitHub, and provider suite passed all 155 tests on Windows. The shared Action
bundle was regenerated. No remote publication was performed.

## 2026-10-26 Compatible 1.0.1 publication

Action `v1.0.1` and standalone CLI `clarissimi@1.0.1` are published from
`20991a4cdd55208bb6c37d798e44eae263ad0537`. Exact-source, immutable-tag,
Marketplace, moving-`v1` and registry consumer evidence is recorded in `docs/ops/release.md`.

Local `pnpm run check` completed 952 tests: 948 passed, four POSIX permission cases
skipped on Windows, zero failures. Hosted Linux CI completed 950 tests with no skips
or failures. Release readiness (including secret scan and Action bundle freshness),
docs, lint, format, migration-check, smoke and installed CLI package verification
passed. `check` already executes the same typecheck and test pair as `contract`,
so that identical pair was not rerun under a second script name.

Release validation exposed a false path-overlap rejection during concurrent imports.
A deterministic regression reproduced rounding of adjacent 64-bit file IDs in the
old number-based comparison; `bigint` stat identities fix it. The regression, concurrent
imports and hard-link checks passed after the fix. Synthetic PEM fixture markers
now construct the same strings without weakening the release secret scan.

The maintainer approved the OIDC-staged npm package with 2FA. Exact registry installation,
CLI help, fixture dry-run and signature/provenance audit passed, and the published
tarball hash matches the reviewed four-file package. No public API, ledger schema, DB,
permission, runner or hygiene-policy change. ADR 0039 documents exact file identities;
ADR 0062 records the compatible patch scope.

## 2026-10-12 Installed standalone CLI workflow

The local package verifier previously stopped at installed `--help`. It now
installs the locally built dependency-free tarball with lifecycle scripts disabled
and runs stage-draft, an unapproved import rejection (exit 6, no output creation),
approve-draft with saved digest, approved import, damaged-derived-output rebuild,
and rebuild --check. Canonical bytes stay unchanged during repair, and recursive
fixture inspection finds no remaining generation files or locks.

`pnpm run verify:cli-package` passed on Windows Node v24.18.0. Six package-contract
tests, lint, docs (158 Markdown files), format and diff checks passed. The initial
new rejection assertion incorrectly expected full issues in CLI JSON; the actual
public contract projects issueCodes, which the final passing verifier checks.
This failure was in the verifier, not evidence of an approval bypass.

ADR 0056 now names the installed workflow checks. No package version, persisted
schema, public CLI signature, DB, runner, CI or hygiene change. No remote publish,
GitHub write or provider call. The unchanged repository-wide suite from the prior
storage patch was not repeated; focus was the changed package verifier and real
installed bundle. Registry installation and other operating systems remain
unverified in this run.

## 2026-10-12 CLI generation rollback

Three regressions reproduced partial output replacement before the fix: failure
on the second derived file or canonical ledger kept earlier files on the new
generation, and a newly created output remained after a later failure.

The existing atomic writer now prepares exclusive same-directory recovery copies
before replacement and restores successful replacements in reverse order after
a normal replacement failure. New outputs are removed. Failed restoration keeps
the recovery copy and reports its path while attempting the remaining restores.
Copies stay on disk rather than duplicating large ledgers in memory. Existing
ledger locks, commit-point order, link checks and access-bit handling remain.

- `pnpm run check`: TypeScript/build and 931 tests completed, 927 passed, four
  POSIX permission cases skipped on Windows, zero failures. Node v24.18.0.
- Fault injection covers later rename failure, new destination removal, partial
  backup preparation failure, backup name collision, failed rollback with retained
  bytes, continued recovery, and existing cleanup/permission behavior. An initial
  existing cleanup assertion counted only staging files; it now also counts the
  prepared recovery copies in the rename-failure case.
- `pnpm run lint`, `pnpm run docs` (158 Markdown files), `pnpm run smoke`, changed
  file format check and `git diff --check` passed. Smoke runs the built CLI against
  temporary fixtures. Action publishing tests use local Git fixtures and injected
  clients; they do not publish this patch remotely.
- ADR 0039 now documents rollback, retained recovery files, extra disk space and
  crash limits. No root public API, ledger schema, DB, dependency, version, runner,
  CI or repository-hygiene change. No push, publication or deployment.
- Power loss, killed-process recovery, POSIX restoration permissions, externally
  edited files that ignore the CLI lock, real providers and hosted release checks
  remain unverified. The patch adds normal failure recovery, not crash atomicity.

- Status: Draft

## Validation Source of Truth

This document owns stable validation names for this scaffold.

## Standard Validation Names

- format
- lint
- typecheck
- test
- contract
- migration-check
- smoke
- docs
- check
- release-readiness

## Required Final Report

Final responses must list executed validations, passed validations, skipped validations, skip reasons, and remaining risk.

## Runner Policy

Task runner files are optional. Runner `none` means no executable task runner is generated.
If a runner is generated, runner command names must match this document.
Unconfigured runner commands must fail, not pass with a fake success.

## Hygiene Validation

Repository hygiene file changes must check line-ending churn, binary diff pollution,
tracked secret files, ignored build/cache artifacts, and generated-output drift.

## Scope

general validation routes must stay stack-neutral unless a runner file explicitly defines a command.

## Repository Shape

monorepo, cli-tool, github-action validation must stay repository-shape focused and must not imply generated application source code.
