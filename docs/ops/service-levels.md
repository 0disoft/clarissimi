# Service Levels

- Status: Draft

## Operational Contract

Define severity, roles, first 10 minutes, communication, timeline, postmortem, follow-up policy, and evidence preservation.

Clarissimi MVP service levels describe maintainer response for source releases, dogfood workflows,
proposal pull requests, and repository-state incidents. There is no hosted uptime target because no
hosted Clarissimi service exists yet.

Service levels:

| Area                        | Target                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Source-only merge readiness | Local `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`, and hygiene checks pass before push. |
| Hosted validation           | `Validation` check passes on `main` after push.                                                               |
| Write-mode dogfood          | Manual propose, stage-draft, and promote-draft workflows pass before release evidence claims support.         |
| Live provider release gate  | Local live-provider smoke plus hosted manual live-provider smoke pass with maintainer-owned credentials.      |
| Versioned Action release    | Immutable tag points to the exact validated SHA and its GitHub pre-release links the evidence issue.          |
| Unsafe output response      | Stop release or dogfood immediately and follow rollback or incident-response docs.                            |
| Ledger recovery             | Restore or revert the canonical ledger before rebuilding derived outputs.                                     |

Severity and response are owned by `docs/ops/incident-response.md`. Rollback procedure is owned by
`docs/ops/rollback.md`. Secrets response is owned by `docs/ops/secrets.md`.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `format`, `smoke`, `check`, `contract`
- Release status: versioned Action tags are allowed by ADR 0031 after release gates pass; public
  package publication remains blocked by `docs/ops/release.md`.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
