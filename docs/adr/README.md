# Architecture Decisions

- Status: Draft
- Owner: Repository maintainers

## Purpose

Architecture decisions record the product boundaries that keep Clarissimi from drifting into a
scoring product, hosted SaaS, or provider-specific workflow before the MVP proves the recognition
engine.

## Accepted ADRs

- `0001-initial-architecture-boundaries.md`: use a public monorepo
- `0002-contract-source-of-truth.md`: treat JSONL ledger as source of truth
- `0003-ai-as-drafter-not-judge.md`: AI drafts; maintainers approve
- `0004-no-public-leaderboard.md`: do not ship public rankings or total scores
- `0005-action-first-no-saas.md`: start with GitHub Action and CLI
- `0006-redaction-before-provider.md`: redact before provider calls
- `0007-provider-adapter-boundary.md`: keep model providers behind adapters
- `0008-propose-mode-default.md`: default write mode is proposed pull request
- `0009-start-schema-package-implementation.md`: start implementation with `packages/schemas`
- `0010-add-redaction-package-boundary.md`: add deterministic redaction before provider calls
- `0011-add-core-policy-package.md`: add pure policy glue for prepared evidence and approval gates
- `0012-add-fake-provider-package.md`: add deterministic fake provider adapter package
- `0013-add-renderers-package.md`: add deterministic repository output renderers
- `0014-add-fixture-first-cli-package.md`: add local fixture-first CLI orchestration
- `0015-add-fixture-first-github-collector.md`: add fixture-first GitHub merged PR evidence collection
- `0016-add-dry-run-action-skeleton.md`: add dry-run-only GitHub Action entrypoint skeleton
- `0017-propose-mode-write-boundary.md`: define propose-mode branch, pull request, and permission boundaries
- `0018-add-live-github-collector-boundary.md`: add live GitHub collector boundary
- `0019-add-openai-compatible-provider-adapter.md`: add SDK-free OpenAI-compatible provider adapter
- `0020-add-agent-assisted-draft-import.md`: add agent-assisted draft import
- `0021-add-draft-inbox-staging.md`: add a review inbox for unapproved drafts
- `0022-keep-ledger-single-file-with-partition-path.md`: keep MVP ledger single-file with a yearly
  partition migration path
- `0023-add-action-draft-inbox-proposal-mode.md`: add an Action mode that proposes draft inbox
  review files
- `0024-add-draft-approval-helper.md`: add a CLI helper for maintainer approval of staged drafts
- `0025-centralize-config-schema-validation.md`: centralize config schema validation in
  `packages/schemas`
- `0026-add-maintainer-recent-share-analytics.md`: add maintainer-only recent recognition share
  analytics
- `0027-add-lint-gate-and-defer-format-baseline.md`: add an Oxlint merge gate and defer the
  formatter baseline rewrite
- `0028-add-native-typescript-config-loading.md`: add dependency-free TypeScript config loading
- `0029-add-explicit-action-config-path.md`: add explicit Action config-file loading
- `0030-add-action-summary-artifact.md`: add a workspace-bounded Action JSON summary artifact
- `0031-first-public-action-release.md`: distribute the first public Action at immutable tag
  `v0.1.0` while package publication remains blocked
- `0032-bundle-action-runtime.md`: keep the composite security boundary while executing a checked,
  committed JavaScript bundle without consumer-time dependency installation or compilation
- `0033-promote-approved-drafts.md`: turn an explicitly approved draft inbox file into a normal
  public recognition proposal without provider calls or direct default-branch writes
- `0034-add-v0-major-alias.md`: provide the moving `v0` Action channel with exact-SHA verification
  while immutable patch tags remain fixed
- `0035-adopt-prettier-format-baseline.md`: adopt a pinned repository-wide Prettier baseline and
  enforce it in hosted CI; superseded by ADR 0036
- `0036-replace-prettier-with-oxfmt.md`: correct the formatter evidence and replace Prettier with a
  pinned repository-wide Oxfmt baseline
- `0037-add-migration-compatibility-gate.md`: replace the fail-closed placeholder with a
  manifest-backed persisted-schema compatibility gate
- `0038-add-explicit-direct-commit-mode.md`: add opt-in Action commits with clean-checkout,
  expected-HEAD, owned-path, and fast-forward push boundaries
- `0039-serialize-cli-ledger-writes.md`: serialize CLI imports and make the canonical ledger the
  final commit point of a staged output generation
- `0040-bound-external-http-requests.md`: bound GitHub and provider request duration and response
  size while exposing structured retryability without automatic retries
- `0041-restrict-provider-endpoint-trust.md`: require public HTTPS provider endpoints by default
  and make trusted private-network access an explicit opt-in
- `0042-add-opt-in-contributor-gallery.md`: add a stable-id avatar gallery as an opt-in
  `CONTRIBUTORS.md` summary without replacing evidence-linked details
- `0043-include-automation-contributors-by-default.md`: include approved bot and AI-agent
  contributors by default with a display-only opt-out
- `0044-authorize-v0-action-release-line.md`: authorize immutable `v0.x.y` root Action releases,
  including pre-tag candidate-SHA evidence, while package and Marketplace publication stay blocked
- `0045-publish-action-to-github-marketplace.md`: authorize the root Action for free GitHub
  Marketplace distribution beginning with non-prerelease release `v0.3.0`, while npm stays blocked
- `0046-recover-transient-proposal-pull-request-failures.md`: recover bounded transient GitHub
  proposal failures without blindly duplicating ambiguous pull request creation
- `0047-add-provider-result-quality-regression-corpus.md`: enforce deterministic provider-result
  invariants with a balanced synthetic pull-request corpus instead of exact prose snapshots
- `0048-report-provider-quality-failures-in-action-summary.md`: render bounded provider validation
  codes and paths in failed Action step summaries without exposing raw provider content
- `0049-add-scrubbed-provider-failure-dirty-corpus.md`: add a privacy-safe candidate, promoted, and
  quarantined intake path for real provider-result failures without weakening the golden corpus
- `0050-add-manual-multi-model-provider-eval.md`: add a credential-safe matrix check and manual-only
  sequential live eval across explicit provider model snapshots
- `0051-add-static-shell-completion.md`: generate deterministic Bash, Zsh, fish, and PowerShell
  completion from the CLI command descriptor without repository inspection
- `0052-bound-provider-input-evidence.md`: bound live changed files, prepared evidence, and provider
  request bodies while failing closed on secret-bearing structural evidence
- `0053-add-opt-in-source-pr-comment-updates.md`: add one opt-in, ownership-checked source pull
  request status comment without duplicate notification noise

## Review Blockers

- A change contradicts an accepted ADR without adding a superseding ADR.
- A change exposes public contributor scores or rankings.
- A change moves domain policy into the CLI or GitHub Action shell.
- A change duplicates schema vocabulary instead of importing it from `packages/schemas`.
- A change bypasses redaction, schema validation, or maintainer approval boundaries.
