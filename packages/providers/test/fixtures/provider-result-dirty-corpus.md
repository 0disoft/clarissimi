# Provider Result Dirty Corpus

This dataset is the intake path for provider-result failures observed outside the deterministic
golden corpus. It starts empty because no scrubbed observed failure has been accepted yet. Do not
copy a synthetic case into this file and label it as production data.

## Case Contract

Each case must contain:

- a local lowercase `id`
- `provenance.kind: scrubbed-observed-failure`
- a SHA-256 `provenance.referenceHash` instead of an issue URL, run URL, account id, or provider
  request id
- `provenance.scrubbed: true`
- `status: candidate`, `promoted`, or `quarantined`
- synthetic evidence item ids and candidate values that reproduce the validator behavior
- deterministic `expectedIssueCodes`

New cases enter as `candidate`. Promote a case only after the scrubbed fixture reproduces
deterministically and its expected issue codes are reviewed. `quarantined` cases require a
`quarantineReason` and stay visible without becoming a release gate.

Raw prompts, provider responses, pull request bodies, patches, emails, tokens, secrets, URLs,
account identifiers, and customer data are forbidden. Keep those values out rather than masking
them in place.

The dirty corpus is diagnostic by default. Only `promoted` cases run as blocking provider-result
regressions; the stable 24-case golden corpus remains the primary deterministic correctness gate.
