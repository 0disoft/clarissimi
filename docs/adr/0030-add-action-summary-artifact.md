# ADR 0030: Add Action Summary Artifact

- Status: Accepted
- Owner: Repository maintainers

## Context

The Action already writes a bounded JSON summary to stdout, GitHub outputs, and the step summary.
Those surfaces are useful during a single workflow run, but maintainers may also want a durable file
that can be uploaded with `actions/upload-artifact` or inspected by a later workflow step.

The artifact must not become a second recognition store. It should be a sanitized run summary for
diagnostics, not public contribution history.

## Decision

Add an optional `summary-path` Action input.

When `summary-path` is omitted, the Action keeps its existing behavior.

When `summary-path` is set:

- the path must be relative
- the path is resolved under `GITHUB_WORKSPACE`
- paths that escape `GITHUB_WORKSPACE` are rejected before provider calls or write-mode mutation
- the Action writes the same sanitized JSON summary that it prints to stdout
- the Action emits `summary-json-path` with the resolved artifact path

The summary artifact must not include raw pull request bodies, raw patch excerpts, raw diffs,
provider raw output, tokens, secrets, or unredacted private data.

## Consequences

Maintainers can upload or inspect a machine-readable Action summary without scraping stdout or the
step summary. The output is still diagnostic only; `.clarissimi/contributions.jsonl` remains the
canonical public recognition ledger.

The workspace-relative restriction keeps this feature from becoming a general runner filesystem
write primitive.

## Validation

- `pnpm run docs`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
