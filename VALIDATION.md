# Validation

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
