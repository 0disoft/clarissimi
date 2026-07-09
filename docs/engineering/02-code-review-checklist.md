# Code Review Checklist

- Status: Draft

## Contract

Code review blockers include ownership drift, hidden auth or token rules, untested failure paths,
contract drift, fake validation success, and generated-output dependency.

Review code changes against these checks:

- Source-of-truth docs changed when behavior, schema, CLI, Action, config, runner, or output
  contracts changed.
- Schema vocabulary is imported from `packages/schemas`, not duplicated.
- Provider adapters do not load environment variables or config files directly.
- GitHub collectors do not call providers or own redaction policy.
- CLI and Action shells orchestrate package boundaries without owning domain policy.
- Write-mode paths fail closed before mutation on validation, policy, provider, renderer, branch,
  or pull request errors.
- Tests cover success, rejected input, failure diagnostics, and no-secret/no-raw-output guarantees.
- Correctness tests avoid live GitHub, live provider credentials, and untrusted PR head code.
- Generated, build, cache, and ignored files are not used as source truth.

## Required Evidence

- Source of truth: `AGENTS.md`, `VALIDATION.md`, `CHECKLIST.md`, `.agents/context-map.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`
- Related checklist: `CHECKLIST.md`

## Review Blockers

- A change weakens approval gates or redaction.
- A change adds live API dependency to core correctness tests.
- A change writes outside documented repository-owned output paths.
- A change skips relevant validation without a stated reason and remaining risk.
