# @clarissimi/schemas

Shared TypeScript schema contracts for Clarissimi.

This package owns contribution assessment types, config types, fixed vocabulary, runtime
validation, and public ranking-language guardrails. It is the source package for contribution
types, impact levels, approval states, and config value validation.

It does not load config files, collect GitHub evidence, call providers, redact evidence, render
outputs, or orchestrate CLI and GitHub Action workflows.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
