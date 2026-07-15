# ADR 0046: Recover Transient Proposal Pull Request Failures

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

Clarissimi's post-release full-write smoke observed GitHub return a transient HTML `Unicorn!`
response while creating a draft proposal pull request. The branch push had already succeeded, but
the single-attempt pull request client failed the Action without determining whether GitHub had
accepted the create request.

Blindly retrying every request is unsafe. A timed-out or disconnected `POST /pulls` can succeed on
the server before the client sees a response, so an immediate second create request can report a
conflict or obscure the pull request that was already created. Permanent permission, repository,
and validation failures must also remain fail-closed.

ADR 0040 bounds external HTTP requests and exposes retryability while leaving retry orchestration
to the caller. `packages/action` owns proposal pull request orchestration and is therefore the
correct boundary for this recovery policy.

## Decision

- Proposal pull request requests use the same default 30-second timeout and 2 MiB response limit as
  other live GitHub requests.
- Safe lookup and update requests make at most three attempts for network failures, timeouts, HTTP
  429 responses, rate-limited HTTP 403 responses, and HTTP 5xx responses.
- Retry delays use bounded exponential backoff with jitter. A valid `Retry-After` value takes
  precedence. Delays above 60 seconds are not shortened; the request fails instead of retrying too
  early or keeping a runner asleep without a useful bound.
- Authentication, authorization, repository-not-found, ordinary 4xx, oversized response, and
  invalid response failures are permanent.
- Pull request creation does not blindly retry an ambiguous `POST /pulls`. After a retryable
  failure, Clarissimi waits according to the retry policy and looks up an open pull request with the
  same repository, deterministic head branch, and base branch. It returns that pull request when
  found and sends another create request only when lookup confirms none exists.
- An HTTP 422 create response is reconciled once through the same deterministic lookup. If no
  matching pull request exists, the original validation failure remains permanent.
- Non-JSON error bodies are not copied into Action diagnostics. GitHub JSON messages are normalized
  and bounded before they reach logs.
- Timeout, byte, sleep, and random sources remain constructor-only test seams. They are not new
  Action inputs.

## Consequences

- A transient GitHub failure can recover without forcing a maintainer to rerun an otherwise valid
  proposal flow.
- Ambiguous create results are resolved against the deterministic proposal branch before another
  mutation is attempted.
- A full retry sequence can take longer than one request, but attempts, response bytes, and delay
  are all bounded.
- Persistent GitHub outages and long rate-limit windows still fail the run with a sanitized,
  actionable error instead of looping indefinitely.

## Validation

- safe request retry and exhaustion regressions
- ambiguous create reconciliation and retry regressions
- HTTP 422 reconciliation regression
- timeout and oversized-response regressions
- non-JSON error-body sanitization regression
- repository `format`, `lint`, `test`, `smoke`, `check`, and `contract` gates
