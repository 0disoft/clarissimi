# ADR 0040: Bound External HTTP Requests

- Status: Accepted
- Date: 2026-07-12
- Owner: Repository maintainers

## Context

The live GitHub client and OpenAI-compatible provider previously awaited network requests and read
response bodies without explicit time or byte budgets. A stalled peer could keep a CLI or Action
run alive indefinitely, while an oversized response could consume runner memory before schema or
evidence bounds were applied.

Clarissimi also needs callers to distinguish transient transport failures from permanent contract
failures without adding automatic retries inside packages that do not own retry policy.

## Decision

- Every live GitHub request has a default 30-second timeout and a 2 MiB response-body limit.
- Every OpenAI-compatible provider request has a default 120-second timeout and a 2 MiB
  response-body limit.
- Package constructors accept positive-integer timeout and response-byte overrides for injected
  runtimes and tests. CLI and Action inputs do not expose these tuning values in this milestone.
- Response readers reject an oversized declared `Content-Length` before reading the body and stop
  streamed reads as soon as the byte budget is exceeded.
- Timeout, network, rate-limit, and server failures are marked retryable. Authentication,
  authorization, not-found, invalid option, invalid response, and oversized response failures are
  permanent. Provider HTTP 429 and 5xx failures are retryable; other provider HTTP failures are
  permanent.
- Packages return structured errors but do not retry automatically. Retry count, delay, jitter,
  rate-limit headers, and workflow policy remain a future orchestration decision.
- Provider transport errors must not include raw response bodies, request bodies, or credentials.

## Consequences

- Stalled or oversized peers fail within deterministic local resource budgets.
- Callers can make an explicit retry decision from `retryable` without parsing messages.
- The provider timeout is longer than the GitHub timeout because model generation is expected to
  have higher latency than repository metadata reads.
- A slow but healthy endpoint beyond the configured budget fails closed and requires an explicit
  constructor override or a later public configuration decision.

## Validation

- timeout regressions for GitHub and provider requests
- streamed response-size regressions for GitHub and provider responses
- retryability classification for HTTP and transport failures
- invalid transport-budget option regressions
- repository `format`, `lint`, `test`, `smoke`, `check`, and `contract` gates
