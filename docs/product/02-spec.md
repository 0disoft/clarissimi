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

Internal policy may use `impactLevel` or `internalImpactWeight` to sort drafts, tune approval
rules, or support maintainer-only analytics. Public output must prioritize the contribution story
over numeric values.

Public output must not show a contributor's percentage share of recent total impact weight, score,
points, or contribution weight. A time-windowed share can read like a softer leaderboard even when
no explicit rank is displayed. Clarissimi may expose this kind of metric only through a
maintainer-only analytics view unless a future ADR accepts a safer public framing.

## Primary Event

The MVP primary event is a merged GitHub pull request.

Clarissimi may support agent-assisted manual draft import for merged pull request assessments. The
agent may draft directly or delegate the draft to another LLM, but public recognition output remains
assessment-only and must not preserve AI agent, provider, prompt, or model provenance.
Clarissimi may stage unapproved agent-authored drafts in a repository-local draft inbox for
maintainer review. Staged drafts are review candidates, not public recognition records.
Closed issues, linked issue authors, reviewers, release validators, and broader manual attribution
remain later capabilities; the first implementation should avoid broad attribution complexity.

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

## Draft Inbox

Unapproved agent-authored drafts may be staged under:

- `.clarissimi/drafts/*.json`

The draft inbox exists so maintainers can inspect, edit, and approve a structured assessment before
publication. Draft inbox files must not be treated as public recognition truth, must not preserve AI
provider provenance, and must not include raw evidence excerpts that are unsafe for repository
storage.

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

`CONTRIBUTORS.md` groups approved recognition by contributor and shows the contributor's total
recognized contribution count plus deterministic per-type counts. These are event counts from the
ledger, not weighted scores, percentages, ranks, or contributor tiers.
Contributor aggregation uses the stable `platform` and platform-issued contributor `id`. Mutable
login and profile fields come from the newest approved record, so an account rename does not split
one contributor into multiple profiles.
An opt-in compact summary table may repeat contributor identity, total event count, and deterministic
per-type counts before the detailed sections. It must preserve the evidence-linked contributor
details and must not add score, percentage, rank, ordering-by-count, or tier semantics.
An opt-in contributor gallery may instead display one stable-id GitHub avatar per contributor before
the same detailed sections. Gallery items link to the contributor profile, use deterministic
non-ranking order, include accessible text, and must not replace evidence-linked recognition detail.
Clarissimi does not generate or rewrite the repository README as part of this output contract.

Approved contributors may be human, bot, or AI-agent identities. Bot and AI-agent assessments are
included in contributor Markdown, contributor JSON, galleries, and static display data by default.
Maintainers may disable automated identities in derived display outputs with
`includeAutomationContributors: false`; the canonical ledger remains unchanged. GitHub `Bot` actor
metadata may establish `bot`, but Clarissimi must not infer `ai_agent` from a login name. Reviews,
comments, and checks require their own approved assessment before becoming contributor recognition.

The MVP keeps `contributions.jsonl` as a single file. If ledger size or merge conflicts become a
real operational problem, Clarissimi should migrate through an explicit schema-versioned yearly
partition plan such as `.clarissimi/contributions/2026.jsonl` plus an index file. Monthly partitions
are deferred until repository volume justifies the extra lookup and migration complexity.

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
- `clarissimi stage-draft --draft <path>`
- `clarissimi approve-draft --draft <path>`
- `clarissimi import-draft --draft <path>`
- `clarissimi rebuild`
- `clarissimi analytics recent-share`

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

When provider-result validation rejects a draft, the Action may render bounded structured issue
codes and JSON paths in `GITHUB_STEP_SUMMARY`. It must not render raw provider output, validation
messages, prompts, evidence bodies, patch excerpts, or secrets in that failure summary.

An explicit `commit` mode may write approved or auto-approved recognition directly to the
configured target branch. It preserves the same validation, append-only ledger, duplicate
rejection, complete derived-output rebuild, and owned-path checks as `propose`. It additionally
requires a clean checkout, rejects a stale expected HEAD, uses a bot-authored commit, and performs
only a normal fast-forward push. It must never infer approval, force-push, or become the default.

The Action may also support `stage-draft` mode. This mode creates a proposal pull request containing
only sanitized `.clarissimi/drafts/*.json` review files for normal unapproved drafts. It must not
write public recognition outputs or imply maintainer approval.

The Action may support `promote-draft` for a checked-in draft that already carries explicit
maintainer approval. Promotion must not call a provider or infer approval. It creates a normal
public recognition proposal pull request and leaves the default branch unchanged until a maintainer
merges that proposal.

Both `propose` and `promote-draft` must preserve the append-only ledger. They parse and validate the
checked-out canonical JSONL, reject malformed or duplicate existing identities, reject a new
contributor/source identity that is already present, append the new approved record, and rebuild
derived outputs from the complete ledger before any branch mutation.

`commit` follows the same ledger preservation contract before direct branch mutation.

All Action write modes must reject repository output paths that resolve through symbolic links,
junctions, hard-linked files, or outside the checked-out repository. This validation happens before
copying staged output so repository-controlled filesystem links cannot redirect writes outside the
workspace.

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
- "Earned leaderboard points and gold contributor tier."
- "This person contributed 37% of the last 90 days' contribution score."

## Review Blockers

- Public scoreboards or rankings are introduced.
- Public recent-share, score-share, point-share, or impact-weight-share contributor metrics are
  introduced.
- Claims lack evidence refs.
- Provider input bypasses redaction.
- Provider output bypasses schema validation.
- Action permission changes lack least-privilege review.
- `CONTRIBUTORS.md` can duplicate entries after rebuild.
