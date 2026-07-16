# @clarissimi/cli

Local Clarissimi command orchestration.

This package owns command parsing, fixture-first orchestration, agent-assisted draft staging,
approval, import, config file loading, ledger validation, rebuild command I/O, and maintainer-only
analytics commands. It also owns the typed command descriptor and deterministic Bash, Zsh, fish,
and PowerShell completion generation used by `clarissimi completion <shell>`.

It does not own domain policy, schema vocabulary, shared config value validation, provider
behavior, GitHub API collection, or GitHub Action runtime behavior.

Source of truth:

- [CLI command contract](../../docs/cli/command-contract.md)
- [Shell completion](../../docs/cli/shell-completion.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
