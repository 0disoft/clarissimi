# @clarissimi/action

GitHub Action runner for Clarissimi.

This package owns Action input resolution, event and approved-draft file reading, live collector
routing, token injection into the GitHub collector client, bounded dry-run, propose, stage-draft,
and promote-draft summaries, temporary output staging, proposal branch writing and publishing, and
proposal pull request creation or update.

Write-mode public recognition staging reads and validates the checked-out canonical ledger, appends
the new approved record with contributor/source duplicate protection, and rebuilds derived outputs
from the complete record set. Malformed or duplicate existing ledger state fails before branch
publication.

The proposal writer rejects output paths that resolve through symlinks, junctions, hard links, or
outside the checked-out repository before copying staged files.

It does not own live GitHub evidence normalization, provider token handling, default-branch writes,
domain policy, or provider behavior.

Source of truth:

- [GitHub Action contract](../../docs/github-action/action-contract.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
