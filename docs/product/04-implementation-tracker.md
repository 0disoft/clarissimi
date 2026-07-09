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

- `packages/schemas`: config and contribution assessment vocabulary plus runtime validation,
  including rejection of public score, rank, leaderboard, point, and contributor-tier fields and
  generated public narrative text in assessment drafts, including public recent score-share and
  contribution-weight-share variants
- `packages/core`: prepared-evidence policy glue and approval gates
- `packages/redaction`: deterministic string and JSON-like redaction
- `packages/github`: fixture-first and injected-client live merged pull request evidence collection
- `packages/providers`: provider adapter interface, deterministic fake provider, and SDK-free
  OpenAI-compatible HTTP adapter; deterministic fake provider falls back to safe narrative values
  when maintainer hints would introduce public scoring or ranking language; OpenAI-compatible
  provider instructions reject public score-share and time-window contribution-percentage language
- `packages/renderers`: JSONL, contributor JSON, Markdown, static-data renderers, draft review
  JSON rendering, and maintainer-only recent-share analytics
- `packages/cli`: fixture-first validation, recognition dry-run, agent-assisted draft staging,
  approval, import, rebuild, maintainer-only analytics commands, help output, and explicit fake or
  OpenAI-compatible provider selection
- `packages/action`: Action runner for dry-run summaries, fixture-first public recognition
  proposals, fixture-first draft review proposals, and event-path live GitHub collection in write
  modes with explicit fake or OpenAI-compatible provider selection
- root `action.yml`: composite Action defaulting to `propose` and exposing explicit `dry-run`
- root `package.json`: configured `docs`, `smoke`, and release-only `live-provider-smoke` scripts
  for documentation integrity, CLI subprocess smoke coverage, Action dry-run coverage, and default
  propose and live-provider credential preflight fail-closed behavior
- root `package.json`: configured `release-readiness` script for non-credentialed release gate
  checks, including package test-registration drift and release tool availability, before live
  provider smoke
- root `package.json`: configured `hosted-live-provider-smoke` script for maintainer-triggered
  hosted workflow dispatch and watch after the repository secret name is configured
- `.github/workflows/clarissimi-dry-run.yml`: read-only dogfood for `github-fixture` and
  `event-path` inputs
- `.github/workflows/clarissimi-propose-fixture.yml`: manual-only fixture propose dogfood
- `.github/workflows/clarissimi-stage-draft-fixture.yml`: manual-only fixture stage-draft dogfood
- `.github/workflows/clarissimi-live-provider-smoke.yml`: manual-only credentialed live provider
  smoke
- `.github/workflows/ci.yml`: hosted validation for `docs`, `release-readiness`, `smoke`,
  `check`, and `contract`

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
- proposal commits use a Clarissimi-owned bot author without relying on runner-global git identity

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
- proposal pull requests target the current GitHub Actions repository while preserving collected
  source repository context in the recognition body

Validation:

- end-to-end fixture tests
- read-only dry-run dogfood remains unchanged
- maintainer-triggered propose dogfood passed run `28984721611`, creating
  `https://github.com/0disoft/clarissimi/pull/1`

### 6. Live GitHub Collection

Source: `docs/product/01-roadmap.md`

Status: Completed for the `packages/github` collector boundary in `packages/github/src/live.ts`
and `packages/github/src/api-client.ts`. Action live-event wiring is tracked separately in the next
completed slice.

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

Source: `docs/adr/0007-provider-adapter-boundary.md`,
`docs/adr/0019-add-openai-compatible-provider-adapter.md`

Status: Completed for the provider package boundary in `packages/providers/src/openai-compatible-provider.ts`.

Goal: add the first live provider adapter without moving provider-specific behavior into core,
schemas, CLI, or Action shells.

Completed deliverables:

- provider adapter behind the existing provider interface
- no raw evidence accepted without `PreparedProviderEvidence`
- provider raw output not logged by default
- fake provider remains the default correctness-test path
- credential handling documented without fake secrets
- no SDK dependency or environment-variable loading inside `packages/providers`
- model output cannot approve contributions or alter contributor identity, evidence refs, or source
- CLI and Action provider selection use fake by default and support explicit `openai-compatible`
  selection with caller-owned token loading
- release-only live provider smoke harness exists without joining normal correctness tests

Validation:

- OpenAI-compatible provider fake-fetch tests
- CLI and Action provider-selection tests with injected fetch
- fake-provider core tests continue to pass
- live-provider smoke is explicit, credentialed, and release-only

### 9. Documentation And Release Readiness

Source: `README.md`, `docs/product/01-roadmap.md`

Status: Completed for current implementation alignment. Public package publication remains blocked
by `docs/ops/release.md` pre-release gates.

Goal: keep public documentation aligned with the implementation state.

Completed deliverables:

- README status stays accurate
- installation and dry-run examples match the root Action contract
- propose mode docs are added only when implementation exists
- release or versioning policy blocks package publication until release gates are satisfied
- manual-only fixture propose dogfood workflow is available and passed run `28984721611`, creating
  `https://github.com/0disoft/clarissimi/pull/1`
- hosted CI workflow exists for push, pull request, and manual validation
- hosted CI installs pinned non-credentialed release tooling and runs `release-readiness`
- `main` branch protection requires the hosted `Validation` check with strict status checks
- docs validation checks required documentation targets and local Markdown links
- release-readiness validates the hosted CI workflow trigger, read-only permission, and required
  command contract before reporting static release gates as passed
- smoke validation exercises the built CLI and Action bins without live provider credentials
- live-provider smoke command is available as a release-only credentialed check and passed locally
  on `2026-07-09` with maintainer-owned credentials and
  `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`
- live-provider smoke validates optional endpoint and thinking-mode inputs before provider calls
- live-provider smoke strips unrelated known provider and GitHub token environment names before
  invoking the child CLI process
- OpenCode Go live-provider smoke passed locally on `2026-07-09` with maintainer-owned
  credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`, the OpenCode Go chat completions endpoint,
  and `CLARISSIMI_PROVIDER_THINKING=disabled`
- UMANS live-provider smoke passed locally on `2026-07-09` with maintainer-owned credentials,
  `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`, and the UMANS OpenAI-compatible chat completions
  endpoint
- manual live-provider smoke workflow is available for maintainer-owned repository secrets and
  dispatch-time provider model input
- hosted live-provider smoke wrapper verifies the repository secret name, dispatches the manual
  workflow, and watches the matching run without reading or printing the token value
- hosted live-provider smoke wrapper tests cover missing-secret fail-closed behavior and
  dispatch/list/watch argument construction with a fake `gh` command runner
- live-provider smoke script tests cover import-safe execution and child-process environment
  filtering for unrelated provider and GitHub token names
- hosted live-provider smoke wrapper validates non-empty model, HTTPS endpoint override, and
  supported thinking mode before reading secret metadata or dispatching a workflow
- hosted live-provider smoke workflow validates model, endpoint, and thinking inputs before
  checkout, dependency installation, build work, or provider calls
- hosted live-provider smoke wrapper validates repository and ref arguments before calling `gh`
- hosted live-provider smoke wrapper rejects malformed dispatched run metadata before invoking
  `gh run watch`
- release-readiness validates the hosted live-provider workflow input, secret, and run-command
  contract before reporting static release gates as passed
- release-readiness verifies that release-critical package scripts remain registered
- release-readiness verifies that package test globs still include package and script test suites
- release-readiness verifies that `ssealed`, `actionlint`, and `yq` are available before running
  tool-backed release checks
- release-readiness secret scan covers committed provider gateway token assignments including
  Clarissimi, OpenCode Go, UMANS, DeepSeek, Node auth, and GitHub PAT environment names
- agent-assisted draft guide documents a copyable assessment template, PR source fields, evidence
  refs, impact/confidence semantics, and delegated model envelopes
- ledger format guide documents public ledger fields, PR number and URL placement, draft-versus-ledger
  boundaries, no-public-score constraints, and the single-file MVP partition decision
- product and ADR docs reject public recent score-share, point-share, impact-weight-share, and
  contribution-weight-share metrics while leaving room for future opt-in maintainer analytics
- docs validation treats the agent-assisted draft guide as a required documentation target
- docs validation treats the ledger format guide as a required documentation target
- docs validation parses fenced `json` examples so copyable draft templates cannot silently drift
- script tests cover docs validation success, invalid fenced JSON, and missing local Markdown links
- script tests validate the agent-assisted draft guide's JSON examples against
  `clarissimi.assessment/v1`
- script tests validate the ledger format guide's JSON example against `clarissimi.assessment/v1`
- rollback instructions cover staging cleanup, proposal pull request closure, proposal branch
  deletion, and post-merge recognition reverts
- manual-only fixture stage-draft dogfood workflow is available and passed run `28992586329`,
  creating `https://github.com/0disoft/clarissimi/pull/2`

Release follow-up:

- Hosted manual live-provider smoke workflow evidence with repository secret configuration remains
  required before automated provider-mode public release.

### 10. Agent-Assisted Draft Import

Source: `docs/adr/0020-add-agent-assisted-draft-import.md`,
`docs/cli/command-contract.md`

Status: Completed for local CLI import.

Goal: let maintainers use an already-running AI coding agent as the drafter without requiring
Clarissimi to own or configure that agent's provider API key.

Completed deliverables:

- `clarissimi import-draft --draft <path>` validates complete assessment JSON documents
- `clarissimi.draft-envelope/v1` wrappers are accepted for delegated LLM workflows
- approved and auto-approved drafts can be imported into the JSONL ledger
- draft, rejected, skipped, invalid, and duplicate contributor/source records are rejected
- `validate-ledger` and `rebuild` reject duplicate contributor/source records in an existing ledger
- derived contributors JSON, Markdown, and static JSON can be rebuilt through `--out-dir`
- public ledger records continue to omit raw evidence excerpts and AI/provider provenance

Validation:

- CLI import-draft tests
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

### 11. Draft Inbox Staging

Source: `docs/adr/0021-add-draft-inbox-staging.md`,
`docs/cli/command-contract.md`

Status: Completed for local CLI staging.

Goal: give maintainers a durable place to review AI-authored drafts before approval without mixing
unapproved records into the public recognition ledger.

Completed deliverables:

- `clarissimi stage-draft --draft <path>` validates complete assessment JSON documents
- `clarissimi.draft-envelope/v1` wrappers are accepted for delegated LLM workflows
- only `maintainerApprovalStatus: "draft"` can be staged
- staged files are written to deterministic paths under `.clarissimi/drafts/`
- raw evidence excerpts and AI/provider provenance are omitted from staged files
- existing staged draft paths are not overwritten
- `.clarissimi/contributions.jsonl` remains untouched until `import-draft`

Validation:

- CLI stage-draft tests
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

### 12. Ledger Partition Decision

Source: `docs/adr/0022-keep-ledger-single-file-with-partition-path.md`,
`docs/product/02-spec.md`

Status: Completed as a product and architecture decision.

Goal: keep the MVP ledger simple while documenting the migration path for repositories that later
outgrow a single JSONL file.

Completed deliverables:

- `.clarissimi/contributions.jsonl` remains the MVP canonical ledger
- yearly partitions plus an index are documented as the future migration path
- monthly partitions are deferred until real repository volume justifies them
- future partition migration requirements preserve schema versions, rebuild determinism, duplicate
  detection, and no-public-score guarantees

Validation:

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

### 13. Action Draft Inbox Proposal Mode

Source: `docs/adr/0023-add-action-draft-inbox-proposal-mode.md`,
`docs/github-action/action-contract.md`

Status: Completed for fixture-first and event-path Action flows.

Goal: let automated post-merge Action runs open a maintainer-review pull request containing only a
sanitized draft inbox file when the assessment is still unapproved.

Completed deliverables:

- `mode: stage-draft` routes through the same evidence, redaction, and provider path as dry-run and
  propose mode
- unsupported Action modes are rejected before provider credential resolution, collection, staging,
  branch publication, or pull request work begins
- `stage-draft` accepts normal `draft` assessments and rejects approved public-output publication
  paths
- staged files are limited to `.clarissimi/drafts/*.json`
- staged draft files omit raw evidence excerpts and provider provenance
- proposal branches use `clarissimi/drafts/<source-kind>-<source-id>`
- proposal pull request titles and bodies use draft review language instead of public recognition
  language
- Action outputs and step summaries include proposal metadata without raw evidence
- manual-only fixture dogfood workflow verifies stage-draft Action outputs

Validation:

- renderer draft review tests
- Action staging, branch writer, pull request, environment, and runner tests
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

### 14. Draft Approval Helper

Source: `docs/adr/0024-add-draft-approval-helper.md`, `docs/cli/command-contract.md`

Status: Completed in `packages/cli/src/run.ts`.

Goal: give maintainers a command-level approval step between draft inbox review and public ledger
import.

Completed deliverables:

- `clarissimi approve-draft --draft <path>` validates draft assessment documents
- only current `maintainerApprovalStatus: "draft"` files can be approved
- approved files are rewritten as sanitized assessment JSON, not draft envelopes
- raw evidence excerpts and AI/provider provenance remain omitted
- `.clarissimi/contributions.jsonl` remains untouched until `import-draft`

Validation:

- CLI approve-draft tests
- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

### 15. Architecture Quality Attributes

Source: `docs/architecture/03-quality-attributes.md`,
`docs/engineering/03-performance-budget.md`, `docs/engineering/08-threat-model.md`,
`docs/engineering/09-data-integrity.md`

Status: Completed as an architecture contract alignment.

Goal: remove the remaining undecided architecture placeholder and make quality requirements
traceable to the implemented MVP flows.

Completed deliverables:

- quality attributes are tied to recognize, draft staging, approval, import, rebuild, and Action
  runner flows
- fail-closed behavior is documented for invalid config, evidence mismatch, redaction failure,
  provider failure, schema failure, duplicate records, and renderer rebuilds
- trust, privacy, security, integrity, maintainability, operability, performance, and portability
  expectations are named
- review blockers cover public scores, unredacted provider input, pre-approval writes,
  non-deterministic ledger rendering, and package boundary drift

Validation:

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

### 16. Shared Config Schema Validation

Source: `docs/adr/0025-centralize-config-schema-validation.md`,
`docs/cli/configuration.md`, `docs/monorepo/package-ownership.md`

Status: Completed in `packages/schemas/src/validation.ts` and `packages/cli/src/config.ts`.

Goal: keep config value validation in the schema package while leaving file loading and CLI
precedence in the CLI shell.

Completed deliverables:

- `packages/schemas` exports supported config providers, modes, provider thinking values, and
  `ClarissimiConfig`
- `validateClarissimiConfig` validates config object values, including HTTP(S) provider endpoints,
  without reading files or secrets
- CLI config loading delegates value validation to `packages/schemas`
- CLI flags and Action inputs reuse schema guards for provider identifiers and provider thinking
  values
- CLI remains responsible for `.clarissimi/config.json`, explicit `--config <path>`, JSON parsing,
  and invalid-config exit behavior

Validation:

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`

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
