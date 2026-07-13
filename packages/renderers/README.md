# @clarissimi/renderers

Deterministic repository output renderers for Clarissimi.

This package owns JSONL ledger rendering, derived contributor JSON, Markdown output, static JSON
data, draft review JSON, output path constants, and maintainer-only analytics documents.
Markdown output may opt into a compact count table or a stable-id GitHub avatar gallery while
preserving the evidence-linked contributor details.

It does not collect evidence, call providers, approve assessments, write files directly, or
orchestrate CLI and GitHub Action workflows.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
