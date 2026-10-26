# ADR 0064: Discover GitHub Contributor Candidates

- Status: Accepted
- Date: 2026-10-26
- Owner: Repository maintainers

## Decision

An opt-in live GitHub collection boundary may discover contributor candidates from collected inline
review comments, up to 25 submitted PR reviews, and reporters of up to 10 linked issues. The CLI
enables this discovery for live recognition; existing Action calls keep their current API budget.
Reviews and issue lookups use the existing bounded injected transport and do not execute PR code.

Candidates contain a stable GitHub contributor identity, observed roles (`reviewer`, `issue_reporter`),
and sanitized evidence reference links. Duplicate actors are merged by stable account ID; the PR
author is omitted from the additional candidate list. Deleted actors, pending reviews, and issue
endpoint responses representing PRs are not treated as new reporter candidates.

The candidate list is a suggestion for maintainer review. It is not an assessment, credit award,
approval, or public ledger entry. Recognizing a candidate still requires an individually reviewed
draft through existing schema, redaction, approval and ledger checks. Account IDs remain authoritative
when login names change. Discovery failures/limits are reported without copying raw API errors.

GitHub owns transport, actor normalization and discovery. CLI owns discovery selection and candidate
presentation. Candidate metadata does not extend the public assessment schema or contribution types.

## Consequences

Live CLI users can see contributors beyond the PR author without automatic credit assignment.
Public GitHub token permissions must allow reading the selected PRs and issues. Private/inaccessible
linked issues and missing permissions reduce candidate coverage and are explicitly reported. Large
historical repository backfills remain outside this bounded selected-PR workflow.
