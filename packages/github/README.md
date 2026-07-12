# @clarissimi/github

GitHub merged pull request evidence collection for Clarissimi.

This package owns fixture-first and injected-client live collection for public merged pull request
evidence. It normalizes bounded PR metadata, labels, files, review comments, linked issue
candidates, and merge commit metadata for the rest of the recognition pipeline.

Live requests default to a 30-second timeout and a 2 MiB response limit. Structured errors expose
whether a caller may retry, but this package does not perform retries.

It does not load tokens, read environment variables, own domain policy, call providers, redact
evidence, orchestrate the CLI or Action, or write repository files.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
