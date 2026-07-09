# @clarissimi/cli

Local Clarissimi command orchestration.

This package owns command parsing, fixture-first orchestration, agent-assisted draft staging,
approval, import, config file loading, ledger validation, rebuild command I/O, and maintainer-only
analytics commands.

It does not own domain policy, schema vocabulary, shared config value validation, provider
behavior, GitHub API collection, or GitHub Action runtime behavior.

Source of truth:

- [CLI command contract](../../docs/cli/command-contract.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
