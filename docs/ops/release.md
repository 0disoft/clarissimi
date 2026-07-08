# Release

- Status: Draft

## Operational Contract

Cover release types, versioning, pre-release checklist, deployment flow, post-deploy verification, stop conditions, and owner handoff.

## Current Release Policy

Clarissimi is not ready for public package publication. The repository may continue to merge and
dogfood source changes on `main`, but npm package publication, marketplace release notes, or a
versioned Action tag must wait until the pre-release gates below are satisfied.

The current root package stays private at `0.0.0`. Do not bump versions, publish packages, or create
release tags as part of ordinary implementation work until maintainers accept a release ADR or
update this operational contract.

## Release Types

- Source-only merge: allowed after `pnpm run check`, `pnpm run contract`, and repository hygiene
  checks pass.
- Dogfood workflow update: allowed when Action examples, permissions, `actionlint`, and root
  `action.yml` parsing pass.
- Public package publication: blocked.
- Versioned GitHub Action tag: blocked.

## Pre-Release Gates

Public package publication and versioned Action tags require:

- live provider adapter credential handling is implemented and documented without fake secrets
- a maintainer-triggered propose dogfood workflow or equivalent public repository scenario passes
- `pnpm run check`
- `pnpm run contract`
- `ssealed doctor . --json`
- `actionlint` for workflow examples
- root `action.yml` parses with `yq`
- secret scan shows no committed provider tokens, GitHub tokens, private keys, or environment files
- rollback instructions cover closing proposal pull requests and deleting proposal branches

## Owners

- Primary owner: UNASSIGNED
- Backup owner: UNASSIGNED
- Escalation path: UNDECIDED

## Validation

- Required validation names: `check`, `contract`, `smoke`, `docs`
- Release blocker status: public package publication and versioned Action tags are blocked
- Remaining operational risk: live provider behavior and maintainer-triggered propose dogfood are
  not complete
