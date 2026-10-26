# Validation

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
