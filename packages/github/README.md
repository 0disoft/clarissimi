# @clarissimi/github

GitHub merged pull request evidence collection for Clarissimi.

This package owns fixture-first and injected-client live collection for public merged pull request
evidence. It normalizes bounded PR metadata, labels, files, review comments, linked issue
candidates, and merge commit metadata for the rest of the recognition pipeline.

It does not load tokens, read environment variables, own domain policy, call providers, redact
evidence, orchestrate the CLI or Action, or write repository files.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
