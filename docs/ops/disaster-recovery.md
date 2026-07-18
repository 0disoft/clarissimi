# Disaster Recovery

- Status: Draft

## Operational Contract

Define severity, roles, first 10 minutes, communication, timeline, postmortem, follow-up policy, and evidence preservation.

Clarissimi disaster recovery covers repository-state corruption, unsafe recognition publication,
secret leakage, and broken release gates. It does not cover hosted runtime failover because no
hosted service exists in the MVP.

Disaster triggers:

- public recognition output contains raw evidence, provider raw output, secrets, raw diffs, or
  patch excerpts
- write-mode automation mutates the default branch without explicit `commit` mode, owned-path
  validation, or a matching expected HEAD
- branch protection no longer requires the hosted `Validation` check
- provider credentials are committed, logged, or copied into public artifacts
- `.clarissimi/contributions.jsonl` cannot be parsed or rebuilt into derived outputs

First 10 minutes:

1. Stop release, publication, and dogfood workflow runs.
2. Close or pause unsafe proposal pull requests.
3. Revoke or rotate any exposed credential.
4. Preserve the failing commit SHA, workflow run URL, pull request URL, and changed file list.
5. Choose rollback or forward-fix using `docs/ops/rollback.md`.

Evidence to preserve:

- exact commit SHA and branch
- workflow run URL and job logs
- proposal pull request URL
- list of affected `.clarissimi/` and public output files
- validation command output
- redacted summary of any exposed secret or sensitive evidence

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `migration-check`, `smoke`, `check`, `contract`
- Release status: versioned Action tags are allowed by ADR 0031 after release gates pass; workspace
  packages remain private, and standalone CLI publication follows the manual ADR 0056 gates.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
