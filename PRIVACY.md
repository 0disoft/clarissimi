# Privacy Policy

## Scope

This document describes the intended privacy boundary for the open-source Clarissimi tool.

Clarissimi's MVP is a local CLI and GitHub Action. It does not require a Clarissimi-hosted server,
database, account system, telemetry pipeline, or SaaS backend.

## Default Data Source

Clarissimi is designed to process public repository data by default, including:

- pull request title, body, author, labels, comments, reviews, changed file summaries, and bounded
  patch excerpts
- linked issue title, body, author, labels, and comments when configured
- commit messages and merge metadata
- maintainer comments and approval evidence

Private repository support is deferred and must not be implied by MVP documentation.

## Personal Data

Clarissimi may process public GitHub identity fields such as:

- GitHub login
- GitHub user ID
- public profile URL
- public display name when returned by GitHub

Clarissimi should not collect commit author email addresses by default. If an email appears in
repository text or metadata, redaction should remove or mask it before provider calls and public
outputs unless a maintainer explicitly defines a narrower project policy.

## External Provider Calls

When a maintainer configures an LLM provider, Clarissimi may send redacted evidence excerpts to that
provider.

Before any provider call, Clarissimi should:

- minimize the evidence payload
- remove or mask secrets, tokens, private keys, `.env` content, email addresses, and sensitive
  security details
- keep raw provider responses out of logs by default
- validate provider output against Clarissimi schemas before use

Each provider has its own data handling terms. Maintainers are responsible for choosing a provider
whose data policies match their repository's expectations.

## Generated Public Data

Approved recognition may be written to repository-owned files such as:

- `.clarissimi/contributions.jsonl`
- `.clarissimi/contributors.json`
- `CONTRIBUTORS.md`
- static JSON for a future GitHub Pages view

Public recognition should include concise contribution summaries and evidence references. It should
not include raw diffs, raw provider output, private emails, secrets, or sensitive vulnerability
details.

## Telemetry

The MVP should default to no Clarissimi-hosted telemetry.

If telemetry is added later, it must be opt-in and documented before release. Telemetry must not
include raw prompts, raw diffs, raw provider outputs, secrets, or personal data by default.

## Opt-Out and Maintainer Control

Maintainers should be able to skip or reject recognition through configuration, labels, comments, or
approval policy.

Contributor opt-out mechanisms may include:

- `clarissimi:skip` label
- `@clarissimi ignore` maintainer instruction
- `optOutContributors` configuration
- rejected or skipped approval state

## Retention

Clarissimi does not retain data in a hosted service in the MVP.

Repository-owned output is retained according to the target repository's normal Git history,
branching, and file-retention policies. Maintainers can remove or rewrite generated recognition
files according to their repository governance.

## Non-Goals

Clarissimi must not ship these defaults:

- public contributor ranking
- public total score leaderboard
- automatic publication of AI-generated recognition without approval or policy
- storing raw provider output in repository files
- sending unredacted secrets or private data to model providers
