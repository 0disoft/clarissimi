# ADR 0005: Start with GitHub Action and CLI, Not SaaS

- Status: Accepted
- Date: 2026-07-08

## Context

Clarissimi handles repository evidence and may pass redacted excerpts to LLM providers. Trust is
easier when the tool runs in the user's repository and stores data there.

## Decision

The MVP is a GitHub Action and local CLI. Clarissimi will not require a hosted server, external
database, billing account, or organization dashboard for the first product slice.

## Consequences

- Installation stays lightweight for open-source repositories.
- Repository files own recognition history.
- Hosted services, organization graphs, and dashboards are deferred.
- Provider keys remain user-owned secrets in the target repository or local environment.
