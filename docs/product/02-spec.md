# Product Specification

- Status: Draft
- Owner: Repository maintainers

## One-Sentence Contract

Clarissimi records maintainer-approved recognition for meaningful open-source contributions after
merge, using AI only to draft evidence-backed summaries.

## Positioning

Clarissimi must be described as a contribution recognition engine.

Do not describe it as:

- contributor scoring
- contributor ranking
- contributor grading
- a public leaderboard
- an AI code reviewer
- a maintainer replacement

Internal policy may use `impactLevel` or `internalImpactWeight` to sort drafts and tune approval
rules. Public output must prioritize the contribution story over numeric values.

## Primary Event

The MVP primary event is a merged GitHub pull request.

Clarissimi may later support closed issues, linked issue authors, reviewers, release validators, and
manual recognition commands, but the first implementation should avoid broad attribution complexity.

## Evidence Inputs

Clarissimi may collect public repository evidence such as:

- pull request title and body
- pull request author
- changed file metadata and bounded patch excerpts
- linked issue title and body excerpts
- labels
- maintainer comments
- review comments
- commit messages
- test file changes
- release or validation labels

Raw evidence text is untrusted input. It can contain prompt injection, secrets, private data, or
misleading claims.

## Recognition Draft Schema

An assessment draft must include:

- contributor identity
- GitHub login
- profile URL
- contribution type
- affected area
- impact level
- evidence summary
- evidence refs
- suggested badge
- public recognition text
- confidence
- maintainer approval status

The draft is not a public record until policy or maintainer approval allows it.

## Contribution Types

The initial contribution type set is:

- `bug_fix`
- `bug_report`
- `reproduction`
- `test`
- `performance`
- `documentation`
- `security`
- `accessibility`
- `api_design`
- `maintenance`
- `translation`
- `release_validation`
- `example`
- `other`

These describe the contribution event, not the person.

## Impact Levels

Impact levels are:

- `low`
- `medium`
- `high`

Impact describes repository effect for a contribution event. It must not be presented as a
contributor rank.

## Approval States

Approval states are:

- `draft`
- `auto_approved`
- `approved`
- `rejected`
- `skipped`

Auto approval is allowed only when repository policy explicitly permits it. The default public write
mode should still be `propose`.

## Output Files

Approved recognition may update:

- `.clarissimi/contributions.jsonl`
- `.clarissimi/contributors.json`
- `CONTRIBUTORS.md`
- static JSON data for a future GitHub Pages view

`contributions.jsonl` is the source of truth. JSON and Markdown outputs are derived and must be
rebuildable.

## LLM Role

The LLM extracts and summarizes evidence into the fixed schema. It must not decide final public
recognition by itself.

Clarissimi reliability comes from:

- fixed evidence schema
- fixed rubric
- redaction before provider calls
- schema validation after provider output
- configurable policy
- maintainer approval

It must not depend on trusting one model as the final judge.

## Provider Strategy

Clarissimi should support multiple providers through an adapter boundary:

- OpenAI-compatible APIs
- Anthropic
- Gemini
- OpenRouter-compatible APIs
- local models
- fake deterministic provider for tests

Tests for core correctness must use fake deterministic providers, not live LLM APIs.

## Security and Privacy Rules

- Default scope is public repository data.
- Private repository support is deferred.
- Redaction runs before any provider call.
- Secret, token, private key, email, and environment-file patterns are removed or masked.
- Security contributions require maintainer confirmation, security label, advisory reference, or
  test evidence before strong impact is recorded.
- Provider raw responses are not logged by default.
- Clarissimi must not execute untrusted PR head code.

## CLI Contract

The MVP CLI should expose:

- `clarissimi validate-config`
- `clarissimi validate-ledger`
- `clarissimi recognize --fixture <path> --mode dry-run`
- `clarissimi rebuild`

Fixture-first implementation is acceptable before live GitHub collection.

## GitHub Action Contract

The Action should run after safe repository events, preferably after merge or default-branch update.

Default behavior:

- collect merged PR evidence
- build a recognition draft
- apply redaction before provider calls
- validate provider output against schema
- create a proposed recognition PR, or produce a dry-run summary

Default write mode:

- `propose`

Avoid:

- default `pull_request_target`
- checking out or executing untrusted PR head code
- broad token permissions

## Public Output Tone

Public output should say what the contributor helped the project do.

Good:

- "Added regression coverage for the parser crash."
- "Improved setup documentation for first-time contributors."
- "Reduced repeated work in release validation."

Bad:

- "This contributor is high score."
- "Rank 3 contributor."
- "AI judged this contributor as medium quality."

## Review Blockers

- Public scoreboards or rankings are introduced.
- Claims lack evidence refs.
- Provider input bypasses redaction.
- Provider output bypasses schema validation.
- Action permission changes lack least-privilege review.
- `CONTRIBUTORS.md` can duplicate entries after rebuild.
