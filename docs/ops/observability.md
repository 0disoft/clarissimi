# Observability

- Status: Draft

## Operational Contract

Cover logs, metrics, traces, dashboards, alerts, health checks, sampling, retention, and incident evidence quality.

Clarissimi has no hosted metrics pipeline in the MVP. Observability is built from bounded CLI
output, GitHub Action summaries, workflow run logs, proposal pull request bodies, and repository
validation commands.

Observable surfaces:

- CLI JSON output for `recognize`, `stage-draft`, `approve-draft`, `import-draft`, `rebuild`,
  `validate-config`, and `validate-ledger`
- GitHub Action outputs and step summaries for `dry-run`, `propose`, and `stage-draft`
- proposal pull request title, body, branch name, changed file list, and commit SHA
- hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`
- manual dogfood workflow run URLs for propose, stage-draft, and live-provider smoke

Sensitive data rules:

- logs and summaries must not include provider tokens, GitHub tokens, raw provider responses, raw
  diffs, patch excerpts, private keys, or unredacted sensitive evidence
- provider failures should expose actionable categories without raw response bodies
- draft review files may include evidence refs but must not include raw evidence excerpts or
  AI/provider provenance

Health checks:

- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- `ssealed doctor . --json`
- `actionlint` for changed workflow files
- `yq eval '.'` for changed workflow files and root `action.yml`

Retention follows GitHub and Git history. Maintainers should preserve workflow URLs and PR URLs in
release evidence when a manual dogfood run proves a gate.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`
- Release status: versioned Action tags are allowed by ADR 0031 after release gates pass; public
  package publication remains blocked by `docs/ops/release.md`.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
