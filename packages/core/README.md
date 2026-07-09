# @clarissimi/core

Pure policy glue for Clarissimi recognition flows.

This package owns prepared-evidence redaction, evidence ref derivation, and assessment publication
gates. It keeps provider, renderer, CLI, and Action shells from duplicating approval and redaction
policy.

It does not call provider APIs, call GitHub APIs, build prompts, write files, or own Action runtime
behavior.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
