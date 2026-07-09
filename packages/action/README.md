# @clarissimi/action

GitHub Action runner for Clarissimi.

This package owns Action input resolution, event file reading, live collector routing, token
injection into the GitHub collector client, bounded dry-run, propose, and stage-draft summaries,
temporary output staging, proposal branch writing and publishing, and proposal pull request
creation or update.

It does not own live GitHub evidence normalization, provider token handling, default-branch writes,
domain policy, or provider behavior.

Source of truth:

- [GitHub Action contract](../../docs/github-action/action-contract.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
