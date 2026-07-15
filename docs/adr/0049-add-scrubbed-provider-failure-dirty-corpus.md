# ADR 0049: Add a Scrubbed Provider Failure Dirty Corpus

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

ADR 0047 owns a balanced synthetic golden corpus. It also says new real failures should become
scrubbed corpus cases, but the repository has no separate intake path, provenance contract,
quarantine state, or privacy guard for that data. Putting observed failures directly into the golden
set would blur deterministic product requirements with noisy operational incidents. Copying raw
provider or pull request content would also create a secret and personal-data retention risk.

No scrubbed observed provider-result failure has been accepted at the time of this decision. The
repository must not invent one merely to make the dataset non-empty.

## Decision

- `packages/providers/test/fixtures/result-quality-dirty-corpus.json` is the versioned intake path
  for scrubbed observed provider-result failures.
- Every case uses synthetic local values and stores only a SHA-256 incident reference. Raw prompts,
  provider responses, pull request bodies, patches, URLs, account ids, request ids, emails, tokens,
  secrets, and customer data are forbidden.
- Cases move through `candidate`, `promoted`, or `quarantined`. New cases default to `candidate`.
- Only `promoted` cases are blocking deterministic regressions. Candidate and quarantined cases
  remain visible without weakening the stable golden corpus or creating a flaky release gate.
- Quarantined cases require a reason. Promotion requires a deterministic scrubbed reproduction and
  reviewed expected issue codes.
- The dirty corpus starts empty. This is an honest intake contract, not a claim that production
  failures have already been captured.

## Consequences

- Future observed failures have a privacy-safe path into regression coverage.
- Golden and dirty datasets retain different ownership and gate semantics.
- The repository still has no measured real-world dirty-case coverage until an actual scrubbed case
  is reviewed and added.

## Validation

- dirty-corpus contract and privacy regression
- focused provider dirty-corpus test
- repository `docs`, `release-readiness`, `lint`, `format`, `check`, and `contract` gates
