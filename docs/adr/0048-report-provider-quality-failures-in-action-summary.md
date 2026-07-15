# ADR 0048: Report Provider Quality Failures in the Action Summary

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

ADR 0047 makes provider-result quality failures deterministic, but a hosted Action failure currently
leaves the maintainer with only a generic stderr message. The structured validation issues are
available inside the provider adapter, yet exposing raw provider output or validation messages in a
GitHub Step Summary would create a new leak path for pull request text, secrets, or model-generated
content.

## Decision

- When the OpenAI-compatible provider returns an `invalid_assessment` error with structured issues,
  `packages/action` appends a failure section to `GITHUB_STEP_SUMMARY` before returning the existing
  unexpected-failure exit code.
- The section reports only the bounded validator issue code and JSON path. It never reports the raw
  provider response, issue message, prompt, evidence, pull request body, patch excerpt, or token.
- At most eight issues are rendered. Each field is normalized to one line, escaped for Markdown
  tables, and limited to 120 characters. Additional issue count is reported without content.
- Failure-summary write errors do not replace the original provider failure. They add one generic
  stderr diagnostic and preserve the existing exit classification.
- This decision adds no Action input, output, permission, retry, approval, or repository-write mode.

## Consequences

- Maintainers can identify the rejected rule and field directly in the workflow run.
- Step Summary remains useful even when provider-result wording is unsafe to display.
- The Action and provider package remain separate: the provider owns validation, while the Action
  owns bounded GitHub presentation.

## Validation

- Action regression proving codes and paths are rendered while issue messages are omitted
- Action bundle regeneration and freshness check
- repository `docs`, `release-readiness`, `lint`, `format`, `smoke`, `check`, and `contract` gates
