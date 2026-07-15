# ADR 0050: Add a Manual Multi-Model Provider Eval

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

The deterministic provider-result corpus proves local validator behavior, and live-provider smoke
proves one configured model can complete one request. Neither surface compares several explicit
model snapshots over the same accepted golden inputs. A live matrix can consume credentials,
network, time, and money, so turning it into an automatic agent or CI command would be unsafe.

Model output is also untrusted. A useful report must not retain raw responses, exception messages,
tokens, prompts, or evidence content.

## Decision

- `scripts/provider-model-eval.mjs` runs two to eight explicit OpenAI-compatible model entries over
  one to twelve accepted golden corpus cases.
- A versioned JSON matrix names model ids, explicit model names, credential-free HTTPS endpoints,
  token environment variable names, and bounded request limits. Token values are forbidden in the
  matrix.
- `--check` validates the matrix and case selection without reading token values or calling a
  provider. This check is agent-runnable and CI-safe.
- Live mode is manual-only. It verifies every named token exists before the first request, calls
  models and cases sequentially, performs no retries, and makes no repository writes.
- Live output is sanitized JSON containing pass/fail counts, provider error codes, retryability, and
  validator issue codes. It excludes raw output, error messages, issue messages, endpoints, tokens,
  prompts, and evidence.
- Exit code `0` means all model/case pairs passed, `1` means at least one provider case failed, and
  `2` means configuration or credential preflight failed before provider calls.
- The command measures compatibility with accepted deterministic cases. It does not prove prose
  quality, compare subjective model quality, or replace the golden or dirty corpus.

## Consequences

- Maintainers can compare several pinned model choices with one explicit local command.
- Credential and cost-bearing execution stays outside agent and hosted CI authority.
- Results are ephemeral stdout unless the maintainer deliberately redirects the sanitized report.

## Validation

- credential-free matrix check
- preflight test proving all credentials are required before any provider call
- sanitized two-model result regression
- repository `docs`, `release-readiness`, `lint`, `format`, `smoke`, `check`, and `contract` gates
