# Incident Response

- Status: Draft

## Operational Contract

Define severity, roles, first 10 minutes, communication, timeline, postmortem, follow-up policy, and evidence preservation.

Incident response is repository-local for the MVP. Maintainers should treat unsafe recognition
publication, token exposure, branch mutation, and release-gate failures as incidents even when no
hosted service is down.

Severity:

| Severity | Definition | Response |
| --- | --- | --- |
| SEV-1 | Token, private key, raw provider output, raw diff, or sensitive evidence is public. | Stop release, rotate credentials, close or revert unsafe artifacts, rerun full validation. |
| SEV-2 | Default branch or canonical ledger is mutated incorrectly. | Stop write-mode runs, revert or restore ledger, rebuild derived outputs. |
| SEV-3 | Proposal pull request, Action output, or docs contain incorrect but non-sensitive recognition text. | Close or update proposal, correct docs or generated files, rerun targeted validation. |
| SEV-4 | Local validation, hosted CI, or dogfood workflow is flaky without unsafe output. | Capture logs, fix or document the gate before release work continues. |

First response:

1. Capture commit SHA, workflow run URL, PR URL, and local command output.
2. Classify severity by the table above.
3. Stop affected release or dogfood activity.
4. Use `docs/ops/secrets.md` for credential exposure.
5. Use `docs/ops/rollback.md` for proposal branch, pull request, or ledger cleanup.
6. Rerun required validation before resuming.

Post-incident follow-up:

- Add or update tests when the incident was preventable by validation.
- Update rollback, secrets, or CI docs when the response path was unclear.
- Do not publish release notes or versioned Action tags until release blockers are cleared.

## Owners

- Primary owner: Repository maintainers
- Backup owner: UNASSIGNED
- Escalation path: GitHub issues or maintainer-owned repository discussion

## Validation

- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`
- Release blocker status: public package publication and versioned Action tags remain blocked by
  `docs/ops/release.md`.
- Recent hosted live-provider evidence is recorded in `docs/ops/release.md`; refresh it with
  `pnpm run hosted-live-provider-smoke -- --model <provider-model>` for the exact
  release-candidate commit before publication or versioned Action tags.
