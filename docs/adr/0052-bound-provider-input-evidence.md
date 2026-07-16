# ADR 0052: Bound Provider Input Evidence

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

Clarissimi already bounded external response bodies and individual evidence excerpts, but a pull
request could still supply too many changed files, labels, or other evidence items. Repeated
bounded excerpts could therefore produce an unbounded aggregate provider request. Structural
evidence ids and URLs also bypassed text redaction even though they can contain secret-bearing
assignments.

## Decision

- Live GitHub collection accepts at most 100 changed files and fails closed before evidence leaves
  the collector when the API or an injected client returns more.
- Provider preparation accepts at most 256 evidence items. This accommodates the live collector's
  bounded pull request, changed-file, label, review-comment, linked-issue, and merge-commit
  surfaces without permitting unbounded caller input.
- The serialized prepared evidence source, items, and evidence references must not exceed 512 KiB
  of UTF-8 data.
- The complete OpenAI-compatible request body, including prompts, contributor data, evidence, and
  hints, must not exceed 1 MiB of UTF-8 data. This is a hard provider boundary rather than a public
  tuning option.
- Secret-bearing structural evidence ids or URLs fail closed during preparation and are checked
  again immediately before provider payload construction.
- Repository evidence is untrusted data. Provider system instructions explicitly require models
  to ignore instructions embedded in evidence.

## Consequences

- Very large pull requests require a future explicit summarization or chunking design instead of
  silently dropping changed-file evidence.
- Synthetic or custom callers receive deterministic item-count, byte-count, or unsafe-structure
  failures before a provider request.
- Prepared evidence remains comfortably below the final request-body limit while leaving room for
  the fixed prompt, contributor fields, and bounded hints.

## Validation

- live and API-client changed-file overflow regressions
- prepared evidence item-count, aggregate-byte, and structural-field regressions
- provider request-body and untrusted-evidence prompt regressions
- quoted dotenv and generic assignment redaction regressions
- repository `docs`, `release-readiness`, `lint`, `format`, `smoke`, `check`, and `contract` gates
