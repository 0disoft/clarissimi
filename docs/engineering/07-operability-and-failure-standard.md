# Operability and Failure Standard

- Status: Draft

## Contract

Operability standard connects code changes to logs, summaries, rollback, runbooks, health checks,
incident response, and failure evidence.

Clarissimi MVP operability is repository-local:

- CLI failures must return stable exit codes and concise messages.
- JSON output must be machine-readable and avoid raw provider output.
- GitHub Action summaries and outputs must be bounded.
- Proposal pull request bodies must include source reference, changed files, approval summary,
  redaction match count, and rollback guidance without raw evidence.
- Write-mode failures must fail closed before mutation when possible.
- Rollback for proposal branches and pull requests is documented in `docs/ops/rollback.md`.
- Incident and credential leak response is documented in `docs/ops/incident-response.md` and
  `docs/ops/secrets.md`.

## Required Evidence

- Source of truth: `docs/ops/`, `docs/github-action/action-contract.md`,
  `docs/cli/command-contract.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`
- Related checklist: `.agents/checklists/ops-change.md`

## Review Blockers

- A failure path leaks secrets, raw diffs, raw provider output, or sensitive evidence.
- A write-mode path mutates repository state before validation and policy checks.
- A change adds a new failure mode without diagnostics or rollback guidance.
- A release gate is claimed without local or hosted evidence.
