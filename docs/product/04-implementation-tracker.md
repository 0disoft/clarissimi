# Implementation Tracker

- Status: Draft
- Owner: Repository maintainers

## Purpose

This document is the current implementation tracker for Clarissimi. It does not replace the product
specification, ADRs, package ownership table, or GitHub Action plan. It links those source-of-truth
documents into one operational view so the next work item is not hidden across several files.

## Source Of Truth

- Product specification: `docs/product/02-spec.md`
- Roadmap: `docs/product/01-roadmap.md`
- Package ownership: `docs/monorepo/package-ownership.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- ADR index: `docs/adr/README.md`
- GitHub Action contract: `docs/github-action/action-contract.md`
- Propose implementation plan: `docs/github-action/propose-implementation-plan.md`

## Current Implemented Surface

The repository currently has a fixture-first MVP skeleton with a live GitHub collector boundary:

- `packages/schemas`: contribution assessment vocabulary and runtime validation
- `packages/core`: prepared-evidence policy glue and approval gates
- `packages/redaction`: deterministic string and JSON-like redaction
- `packages/github`: fixture-first and injected-client live merged pull request evidence collection
- `packages/providers`: provider adapter interface and deterministic fake provider
- `packages/renderers`: JSONL, contributor JSON, Markdown, and static-data renderers
- `packages/cli`: fixture-first validation, recognition dry-run, and rebuild commands
- `packages/action`: Action runner for dry-run summaries, fixture-first proposal pull requests, and
  event-path live GitHub collection in propose mode
- root `action.yml`: composite Action exposing `dry-run` and fixture-first `propose` modes
- `.github/workflows/clarissimi-dry-run.yml`: read-only dogfood for `github-fixture` and
  `event-path` inputs

## Active Work Queue

### 1. Proposal Output Staging

Source: `docs/github-action/propose-implementation-plan.md`

Status: Completed in `packages/action/src/staging.ts`.

Goal: create a deterministic staging function for the files `propose` mode would write, without
git branch mutation, pull request creation, or default-branch writes.

Completed deliverables:

- internal Action staging types, including a staged-file manifest with path, byte count, and sha256
- temporary-directory staging that reuses `packages/renderers`
- rejection of draft assessments before public output rendering
- tests proving staged metadata and staged output files exclude raw evidence, provider raw output,
  sensitive sentinels, raw diffs, and patch excerpts

Validation:

- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run contract`
- `pnpm run check`

### 2. Proposal Branch Writer Boundary

Source: `docs/github-action/propose-implementation-plan.md`

Status: Completed in `packages/action/src/branch-writer.ts`.

Goal: isolate branch mutation behind a narrow interface after staging is deterministic.

Completed deliverables:

- branch writer interface that accepts only staged manifest and configured branch/base metadata
- deterministic branch name: `clarissimi/recognition/<source-kind>-<source-id>`
- temporary-repository tests proving the default branch is not mutated
- diagnostics for missing base branch, repository directory, staged output directory, staged
  manifest, unsafe output paths, hash mismatches, and existing proposal branches with unowned
  changes

Validation:

- `pnpm run test`
- `pnpm run contract`
- temporary git repository tests

### 3. Pull Request Creator Boundary

Source: `docs/adr/0017-propose-mode-write-boundary.md`

Status: Completed in `packages/action/src/pull-request.ts`.

Goal: add pull request creation or update behind a fake-client-tested adapter before any live GitHub
API dependency is introduced.

Completed deliverables:

- fake GitHub client tests
- pull request title prefix: `Clarissimi recognition:`
- bounded pull request body with source reference, changed files, approval summary, redaction match
  count, and maintainer approval note
- actionable diagnostics for blocked pull request creation permissions and repository settings

Validation:

- adapter-level fake-client tests
- `pnpm run contract`

### 4. Proposal Branch Publisher Boundary

Source: `docs/adr/0017-propose-mode-write-boundary.md`

Status: Completed in `packages/action/src/branch-publisher.ts`.

Goal: publish the deterministic proposal branch before pull request creation without changing the
default branch.

Completed deliverables:

- branch publisher interface that accepts only a branch writer result and configured remote
  metadata
- `git push --force-with-lease` publication to the deterministic proposal branch
- bare-remote tests proving remote `main` is not mutated
- diagnostics for missing repository directory, branch name, commit sha, remote name, and stale
  branch-writer results

Validation:

- `pnpm run test`
- `pnpm run contract`
- temporary bare git repository tests

### 5. Action `mode=propose`

Source: `docs/github-action/action-contract.md`

Status: Completed for fixture-first propose mode in `packages/action/src/run.ts`.

Goal: wire `mode=propose` only after staging, branch writing, branch publishing, and pull request
creation have separate tests.

Completed deliverables:

- `dry-run` remains a no-write path
- unsupported modes still fail as usage errors
- explicit permission guidance remains in `docs/github-action/permissions.md`
- Action outputs and step summaries stay bounded
- provider, schema, policy, renderer, redaction, branch publishing, or pull request failures fail
  closed before mutation

Validation:

- end-to-end fixture tests
- read-only dry-run dogfood remains unchanged
- maintainer-triggered propose dogfood remains future work after repository workflow settings are
  confirmed

### 6. Live GitHub Collection

Source: `docs/product/01-roadmap.md`

Status: Completed for the `packages/github` collector boundary in `packages/github/src/live.ts`
and `packages/github/src/api-client.ts`. Action live-event wiring remains a future integration
slice.

Goal: move beyond fixture-first GitHub evidence collection while preserving the no-untrusted-head-code
boundary.

Completed deliverables:

- public merged pull request evidence collection from GitHub API or Action event context
- bounded collection of PR body, author, labels, changed files, review comments, linked issue
  candidates, and merge commit metadata
- injected REST client with no token or environment loading inside `packages/github`
- provider input still crosses the existing core redaction boundary; the live collector does not
  call providers or redaction directly
- no default `pull_request_target` workflow path

Validation:

- fixture tests
- fake-client tests
- `pnpm run contract`

### 7. Action Live GitHub Wiring

Source: `docs/product/01-roadmap.md`, `docs/adr/0018-add-live-github-collector-boundary.md`

Status: Completed in `packages/action/src/run.ts`.

Goal: let the GitHub Action use live merged pull request collection without executing untrusted pull
request head code.

Completed deliverables:

- Action routing from merged pull request events to the live collector
- GitHub token injection into the live collector client without token logging
- redaction before provider input remains enforced
- `dry-run` and fixture-first paths remain available
- no default `pull_request_target` workflow path

Validation:

- fake-client Action tests
- fixture Action tests continue to pass
- `pnpm run contract`

### 8. Live Provider Adapter

Source: `docs/adr/0007-provider-adapter-boundary.md`

Goal: add the first live provider adapter without moving provider-specific behavior into core,
schemas, CLI, or Action shells.

Expected deliverables:

- provider adapter behind the existing provider interface
- no raw evidence accepted without `PreparedProviderEvidence`
- provider raw output not logged by default
- fake provider remains the default correctness-test path
- credential handling documented without fake secrets

Validation:

- fake-provider core tests continue to pass
- live-provider smoke tests are explicit and optional

### 9. Documentation And Release Readiness

Source: `README.md`, `docs/product/01-roadmap.md`

Goal: keep public documentation aligned with the implementation state.

Expected deliverables:

- README status stays accurate
- installation and dry-run examples match the root Action contract
- propose mode docs are added only when implementation exists
- release or versioning policy is decided before package publication

Validation:

- `pnpm run check`
- `ssealed doctor . --json`
- repository hygiene checks

## Deferred Work

Deferred work stays outside the MVP unless a new ADR or product decision changes scope:

- hosted SaaS
- billing and team accounts
- organization-wide contributor graph
- public leaderboard
- GitLab and Bitbucket support
- private repository optimization
- Slack or Discord notifications
- badge image CDN
- automatic security severity judgment

## Update Rule

When a task changes implementation state, update this tracker in the same pull request or commit as
the code or contract change. Keep source-of-truth decisions in ADRs and product docs; use this file
to show operational progress and next work.
