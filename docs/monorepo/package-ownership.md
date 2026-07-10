# Package Ownership

- Status: Draft
- Repository Type: monorepo

## Repository Type Contract

This repository type owns workspace boundaries, package ownership, dependency policy, and change coordination.

## Source of Truth

- Product decision: docs/product/02-spec.md
- Technical owner: Repository maintainers
- Related ADRs: docs/adr/0009-start-schema-package-implementation.md,
  docs/adr/0012-add-fake-provider-package.md,
  docs/adr/0013-add-renderers-package.md,
  docs/adr/0014-add-fixture-first-cli-package.md,
  docs/adr/0015-add-fixture-first-github-collector.md,
  docs/adr/0016-add-dry-run-action-skeleton.md,
  docs/adr/0017-propose-mode-write-boundary.md,
  docs/adr/0018-add-live-github-collector-boundary.md,
  docs/adr/0019-add-openai-compatible-provider-adapter.md,
  docs/adr/0020-add-agent-assisted-draft-import.md,
  docs/adr/0021-add-draft-inbox-staging.md,
  docs/adr/0022-keep-ledger-single-file-with-partition-path.md,
  docs/adr/0023-add-action-draft-inbox-proposal-mode.md,
  docs/adr/0024-add-draft-approval-helper.md,
  docs/adr/0025-centralize-config-schema-validation.md,
  docs/adr/0026-add-maintainer-recent-share-analytics.md,
  docs/adr/0028-add-native-typescript-config-loading.md,
  docs/adr/0029-add-explicit-action-config-path.md,
  docs/adr/0030-add-action-summary-artifact.md

## Required Decisions

- Monorepo ownership boundary: each package owns a narrow boundary from the product and ADR
  documents.
- Monorepo public contract: packages expose only documented types, functions, and constants.
- Monorepo validation evidence: implemented packages must pass `docs`, `release-readiness`, `lint`,
  `smoke`, `check`, and `contract`; release-readiness verifies that implemented package directories
  stay listed in the Package Table, that Package Table entries point at existing package
  directories, and that workspace package names stay aligned with their `packages/<name>`
  directories.
- Monorepo package manifest policy: implemented package manifests must keep the common
  `./dist/index.js` and `./dist/index.d.ts` entrypoints, expose only `dist` in `files`, keep
  `tsc -b` build scripts, expose bin entries only from `packages/cli` and `packages/action`, and
  carry package-level publication metadata for license, repository directory, homepage, issue
  tracker, Node.js runtime support, and a package README even while publication remains blocked.
- Monorepo internal dependency policy: internal package dependencies must use `workspace:*` in
  `dependencies`, not dev, peer, or optional dependency sections. TypeScript project references
  must also follow the dependency graph below so package manifests and `tsconfig` build order do
  not drift apart.
- Monorepo release or rollout policy: source-only merges may continue after local and hosted
  validation, and ADR 0031 allows the root Action tag after release gates pass. Public package
  publication remains blocked by `docs/ops/release.md`; release-readiness keeps root and workspace
  package manifests private at `0.0.0` while that package blocker is active.
- Monorepo compatibility and migration policy: schema versions must be explicit and migration work
  must be documented before changing accepted public data shapes.

## Package Table

| Package | Status | Owns | Must Not Own |
| --- | --- | --- | --- |
| `packages/schemas` | Implemented | Contribution assessment types, config types, fixed vocabulary, runtime validation, public ranking-language guardrails | Config file loading, GitHub collection, provider calls, redaction, rendering, approval workflow, CLI orchestration, Action orchestration |
| `packages/core` | Implemented | Pure policy glue, prepared evidence redaction, evidence ref derivation, assessment publication gates | Provider API calls, GitHub API calls, prompt construction, filesystem writes, Action runtime concerns |
| `packages/redaction` | Implemented | String and JSON-like value redaction, redaction reports, secret/email/private-key/provider-token masking | Provider API calls, prompt construction, security severity decisions, recognition approval |
| `packages/github` | Implemented | Fixture-first and injected-client live GitHub merged pull request evidence collection | Token loading, environment handling, domain policy, provider calls, redaction policy, CLI orchestration, Action orchestration, repository writes |
| `packages/providers` | Implemented | Provider adapter interface, deterministic fake contribution draft provider, SDK-free OpenAI-compatible HTTP adapter | Schema vocabulary ownership, redaction policy, maintainer approval policy, environment token loading, live LLM SDK clients |
| `packages/renderers` | Implemented | JSONL, derived contributor JSON, Markdown, static-data rendering, draft review JSON rendering, maintainer-only analytics documents, output path constants | Evidence collection, provider calls, approval policy, filesystem writes, CLI orchestration, Action orchestration |
| `packages/cli` | Implemented | Local command parsing, fixture-first orchestration, agent-assisted draft staging, approval, and import, config file loading, ledger validation, rebuild command I/O | Domain policy, schema vocabulary, shared config value validation, provider behavior, GitHub API collection, Action runtime |
| `packages/action` | Implemented | GitHub Action entrypoint, environment input resolution, event file reading, live collector routing and token injection, bounded dry-run/propose/stage-draft summaries, internal proposal output staging into temporary directories, proposal branch writing and publishing behind narrow local git boundaries, proposal pull request creation/update boundary | Live GitHub evidence normalization, provider token handling, default-branch writes, domain policy, provider behavior |

## Internal Dependency Graph

| Package | Allowed internal dependencies |
| --- | --- |
| `packages/schemas` | none |
| `packages/redaction` | none |
| `packages/core` | `@clarissimi/redaction`, `@clarissimi/schemas` |
| `packages/github` | `@clarissimi/core`, `@clarissimi/schemas` |
| `packages/providers` | `@clarissimi/core`, `@clarissimi/schemas` |
| `packages/renderers` | `@clarissimi/core`, `@clarissimi/schemas` |
| `packages/cli` | `@clarissimi/core`, `@clarissimi/github`, `@clarissimi/providers`, `@clarissimi/renderers`, `@clarissimi/schemas` |
| `packages/action` | `@clarissimi/core`, `@clarissimi/github`, `@clarissimi/providers`, `@clarissimi/renderers`, `@clarissimi/schemas` |

## Review Blockers

- Cross-package changes lack ownership and dependency impact review.
- Workspace scripts or package boundaries drift from documented contracts.
- Shared schema vocabulary is duplicated outside `packages/schemas`.
- Planned packages gain implementation before an ADR or package ownership update names the boundary.
- Provider or GitHub packages bypass `packages/redaction` before crossing external trust boundaries.
- CLI, Action, or provider packages duplicate core policy instead of importing it.
