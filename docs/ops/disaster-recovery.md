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
- write-mode automation mutates the default branch directly
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

- Required validation names: `docs`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Current hosted live-provider evidence: workflow run `29018826925` passed on
  `2026-07-09T12:39:17Z` using repository secret `CLARISSIMI_PROVIDER_TOKEN`.
