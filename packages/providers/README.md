# @clarissimi/providers

Contribution draft provider adapters for Clarissimi.

This package owns the provider adapter interface, deterministic fake provider, and SDK-free
OpenAI-compatible HTTP provider. Provider output is validated against shared schemas before it is
returned to callers.

It does not own schema vocabulary, redaction policy, maintainer approval policy, environment token
loading, or provider-specific behavior inside core, CLI, Action, or renderer packages.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
