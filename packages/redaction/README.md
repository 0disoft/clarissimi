# @clarissimi/redaction

Deterministic redaction utilities for Clarissimi evidence.

This package owns string and JSON-like value redaction, redaction reports, and masking for secret,
email, private-key, and provider-token patterns before evidence can leave the repository boundary.

It does not call providers, construct prompts, decide security severity, or approve recognition.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
