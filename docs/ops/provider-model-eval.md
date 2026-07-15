# Provider Model Eval

- Status: Accepted
- Owner: Repository maintainers

This local command compares explicit OpenAI-compatible model snapshots over the same accepted
provider-result golden cases. It is a compatibility eval, not a leaderboard or subjective model
judge.

## Prepare the Matrix

Copy `fixtures/provider-model-eval.example.json` to
`.clarissimi/provider-model-eval.local.json`. Replace both placeholder model names and endpoints,
keep at least two model entries, and select up to twelve accepted case ids from
`packages/providers/test/fixtures/result-quality-corpus.json`.

The matrix stores environment variable names only. Never put a token value, authorization header,
secret, raw prompt, or provider response in it. The local filename is ignored by Git.

Validate without credentials or network:

```powershell
pnpm run provider-model-eval -- --check --matrix .clarissimi/provider-model-eval.local.json
```

## Run Live

Set each token environment variable named by the matrix, then run:

```powershell
pnpm run provider-model-eval -- --matrix .clarissimi/provider-model-eval.local.json
```

The preflight requires every token before the first provider call. Models and cases run
sequentially with no retry. Request timeout, output-token, and response-byte limits come from the
matrix.

The command prints sanitized JSON only. Per-case failures contain stable error code, retryability,
and validator issue codes, never raw provider output or error messages. Exit `0` means every pair
passed, `1` means one or more pairs failed, and `2` means no calls were made because configuration
or credential preflight failed.

The live command is intentionally manual-only. Do not add it to hosted CI, release readiness, or an
agent-runnable command intent.
