# Propose Mode Implementation Plan

- Status: Draft
- Repository Type: github-action

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Default write mode: `docs/adr/0008-propose-mode-default.md`
- Dry-run skeleton boundary: `docs/adr/0016-add-dry-run-action-skeleton.md`
- Propose write boundary: `docs/adr/0017-propose-mode-write-boundary.md`
- Action contract: `docs/github-action/action-contract.md`
- Permissions: `docs/github-action/permissions.md`

## Purpose

This document breaks `propose` mode into implementation slices so repository mutation does not land
as one large branch-writing and pull-request-opening change. It is an execution plan, not a new
permission or product decision.

The current root `action.yml` defaults to `propose` mode and supports explicit read-only `dry-run`.
Live GitHub evidence collection and live provider calls remain separate implementation slices.

## Implementation Slices

### 1. Proposal Output Staging

Add an internal staging step that produces the exact files `propose` mode would write without
touching git, branches, pull requests, or the working tree outside a temporary directory.

The staging step should:

- reuse the renderer package for `.clarissimi/contributions.jsonl`, `.clarissimi/contributors.json`,
  `CONTRIBUTORS.md`, and future static data
- reject draft assessments before public output rendering
- produce a manifest of staged files, hashes, and source event identity
- keep raw evidence, provider raw output, secrets, and patch excerpts out of staged metadata
- expose diagnostics that are safe for Action outputs and step summaries

Validation target:

- fixture-first unit tests proving staged outputs match renderer output and contain no raw evidence

### 2. Proposal Branch Writer Boundary

Add a narrow branch writer interface after staging is deterministic. The first implementation may
use local git commands, but the package boundary should hide that detail from domain logic.

The branch writer should:

- accept only the staged manifest and configured branch/base metadata
- write only Clarissimi-owned output paths
- create or update `clarissimi/recognition/<source-kind>-<source-id>`
- refuse to write when the base branch, source id, or staged manifest is missing
- refuse to overwrite maintainer edits unless idempotent ownership can be proven
- return a structured result with branch name, commit sha, changed files, and rollback hint

Validation target:

- local git-fixture tests that run against a temporary repository and prove no default-branch
  mutation happens

### 3. Pull Request Creator Boundary

Add a pull request creator only after branch writes are isolated and testable.

The pull request creator should:

- open or update one pull request for the deterministic branch
- use a title starting with `Clarissimi recognition:`
- include source reference, changed files, approval summary, redaction match count, and maintainer
  approval note
- avoid raw evidence and provider raw output in the pull request body
- fail with an actionable diagnostic when repository settings or token permissions block pull
  request creation

Validation target:

- adapter-level tests using a fake GitHub client before any live GitHub API integration

### 4. Action Mode Switch

Status: Completed for fixture-first `propose` mode in `packages/action/src/run.ts`.

Wire `mode=propose` into the Action only after staging, branch writing, branch publishing, and pull
request creation have separate tests.

The mode switch should:

- keep `dry-run` as the no-write path
- keep unsupported modes as usage failures
- require explicit workflow permissions documented in `docs/github-action/permissions.md`
- fail closed before mutation on config, redaction, provider, schema, policy, or renderer errors
- emit bounded outputs and step summaries matching the Action contract

Validation target:

- end-to-end fixture tests that prove `dry-run` writes nothing and fixture-first `propose` writes
  only a proposal branch plus pull request metadata

### 5. Dogfood Strategy

Start dogfooding `propose` mode only after fake-client and temporary-repository tests pass.

Recommended order:

1. keep the existing read-only dry-run dogfood workflow unchanged
2. add a manual-only local repository fixture job that exercises staging without repository writes
3. add a maintainer-triggered propose dogfood workflow on a disposable branch or test repository
4. document any required repository setting for workflow-created pull requests

Do not replace the read-only dogfood workflow with a write-mode workflow.

Current status: the read-only dry-run workflow remains in
`.github/workflows/clarissimi-dry-run.yml`, and the maintainer-triggered fixture propose workflow is
available in `.github/workflows/clarissimi-propose-fixture.yml`. A passing maintainer-triggered run
is still required before public package publication or a versioned Action tag.

## Rollback Expectations

Every implementation slice must expose a rollback or cleanup path before the next slice begins:

- staging: delete the temporary output directory
- branch writer: delete the proposal branch before merge
- pull request creator: close the proposal pull request and delete the branch before merge
- post-merge correction: revert the recognition pull request and regenerate derived outputs

## Review Blockers

- `propose` mode writes directly to the default branch.
- Branch writing and pull request creation are introduced in one untested change.
- Domain policy moves into the Action shell or git adapter.
- Action output, step summary, commit message, branch name, or pull request body includes raw
  evidence, provider raw output, secrets, raw diffs, or patch excerpts.
- `dry-run` behavior changes while adding write-mode support.
- Tests require live GitHub credentials or live provider credentials.
