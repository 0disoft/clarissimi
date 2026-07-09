# Runtime Flow

- Status: Draft

## Default Flow

```text
GitHub event or CLI command
  -> event resolver
  -> config loader
  -> GitHub evidence collector
  -> evidence normalizer
  -> redaction layer
  -> rubric input builder
  -> provider adapter
  -> schema validator
  -> policy engine
  -> approval gate
  -> ledger writer
  -> renderer
  -> dry-run summary, proposed PR, or repository file update
```

## Safe Event Preference

The default GitHub Action path should run after merge or default-branch update. This keeps the
workflow away from untrusted fork PR head execution.

`pull_request_target` examples must be treated as advanced or dangerous and must not be the default
documentation path.

## Provider Boundary

Provider calls happen only after redaction. Provider output is treated as untrusted until it passes
schema validation and policy checks.

## Approval Boundary

The LLM creates an `AssessmentDraft`. The system creates a `RecognitionEntry` only when policy and
maintainer approval allow it.

## Output Modes

- `dry-run`: print or upload a summary without writing recognition files
- `propose`: create a pull request with ledger and renderer changes
- `commit`: reserved future direct-write mode for explicitly configured small repositories; not
  implemented in the current CLI or Action paths

Default mode should be `propose`.

## Failure Behavior

- Invalid config fails before provider calls.
- Redaction failures fail closed.
- Provider failures do not write recognition entries.
- Schema validation failures do not write recognition entries.
- Low confidence drafts require review or are skipped by policy.
- Renderer rebuild must be idempotent.
