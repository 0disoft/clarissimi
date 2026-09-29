# ADR 0061: Link Public Claims to Evidence References

- Status: Accepted
- Date: 2026-09-29
- Owner: Repository maintainers

## Context

An assessment keeps an ordered `evidenceRefs` list and two public factual fields,
`evidenceSummary` and `publicRecognitionText`. The current provider validator preserves the
reference list and checks broad security and impact conditions, but does not say which reference
supports a particular claim. A long list of files or tests is not proof of a security, performance,
or regression claim.

The public `clarissimi.assessment/v1` ledger is already in use. Historical records must remain
readable, and the Action release version is independent of the persisted schema version.

## Decision

Add an optional `claimEvidenceLinks` array to an assessment. Each entry contains:

- `field`: `evidenceSummary` or `publicRecognitionText`
- `text`: one exact, ordered segment of that field's public prose
- `evidenceRefIndexes`: one or more zero-based positions in the assessment's ordered `evidenceRefs`

For each field represented in the array, its entry texts joined with one space must equal the
complete field value. Links may not point outside the reference list or repeat an index within one
entry. This keeps the map inspectable without copying raw evidence excerpts or introducing new
untrusted URLs. The map is included in sanitized draft review JSON and the canonical public ledger,
and the approval snapshot covers it. Derived recognition data may expose the map alongside the
same ordered references; human-facing prose remains unchanged.

New provider-generated drafts must include complete links for both fields. The fake provider
generates them deterministically; the OpenAI-compatible provider requests them explicitly and
rejects missing or malformed links. Provider quality checks inspect the references linked to
security, measured performance, and regression-prevention claims, rather than accepting unrelated
references elsewhere in the draft. An unsupported claim fails draft generation for maintainer
review instead of being silently rewritten or auto-approved.

Older `assessment/v1` records and manually authored drafts without links remain valid. Their
missing map means support cannot be inferred, and maintainers must review the prose and references
directly. Existing ledgers need no rewrite or migration edge; the migration compatibility fixture
must remain accepted. A future contract may require links for all new drafts only after a versioned
migration and consumer review.

## Consequences

The map makes provider claims traceable to specific sanitized references, while remaining an
assertion for a maintainer to judge rather than a proof that a source is truthful. Public output
must not expose raw evidence text, provider identity, prompts, or model provenance. CLI and Action
publication continue to require the existing approval and repository-safety gates.

## Validation

- Schema and provider tests for complete coverage, invalid indexes, unsupported claim links, and
  legacy records without maps
- CLI and Action draft, approval, promotion, and output regressions
- Migration compatibility, Action bundle freshness, docs, format, lint, smoke, and check gates
