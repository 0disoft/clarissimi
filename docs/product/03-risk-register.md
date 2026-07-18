# Risk Register

- Status: Draft
- Owner: Repository maintainers

## R1: Scoring Backlash

- Severity: High
- Trigger: public numeric scores, rankings, contributor tiers, score-share ratios, impact-weight
  share ratios, or leaderboard language
- Impact: community distrust and contributor pushback
- Mitigation: public output is narrative-first; numeric weight stays internal; ADR records no public
  leaderboard; schema validation rejects explicit public score, rank, leaderboard, point, and
  contributor-tier field names and common field-name variants in assessment drafts; time-windowed
  contribution share metrics stay maintainer-only unless a future ADR accepts a safer public
  presentation

## R2: Hallucinated Recognition

- Severity: High
- Trigger: LLM claims a PR improved performance, security, or reliability without evidence
- Impact: public recognition becomes untrustworthy
- Mitigation: every claim needs evidence refs; provider output is schema validated; low confidence
  routes to maintainer review

## R3: Prompt Injection

- Severity: High
- Trigger: PR body, issue text, review comment, or commit message tells the model to ignore rules
- Impact: manipulated impact level or unsafe output
- Mitigation: treat repository text as untrusted data; separate system instructions from evidence;
  validate output with schema and policy

## R4: Secret Leakage

- Severity: Critical
- Trigger: diff, issue, or comment contains token, private key, email, or `.env` content
- Impact: sensitive data sent to an external provider or committed into public output
- Mitigation: redaction before provider calls; minimal evidence excerpts; no provider raw logs by
  default

## R5: Unsafe GitHub Action Event

- Severity: High
- Trigger: default use of `pull_request_target` or execution of untrusted fork PR code
- Impact: token exposure or repository compromise
- Mitigation: Action-first design uses safe post-merge/default-branch events; least-privilege
  permissions; no untrusted head checkout

## R6: Attribution Overreach

- Severity: Medium
- Trigger: MVP tries to recognize issue authors, reviewers, co-authors, reproduction authors, and
  release validators at once
- Impact: fairness disputes and unclear approval burden
- Mitigation: first-class MVP path is merged PR author; additional attribution requires explicit
  label, config, or later milestone

## R7: Markdown Churn

- Severity: Medium
- Trigger: every merge rewrites large contributor sections
- Impact: noisy diffs and maintainer fatigue
- Mitigation: append-only JSONL ledger is source of truth; Markdown output is derived and
  idempotent

## R8: Provider Cost and Latency

- Severity: Medium
- Trigger: large PRs send full diffs to LLM providers
- Impact: slow workflows and high API costs
- Mitigation: minimal evidence summary by default; patch excerpt limits; fake provider for tests;
  local provider path

## R9: Schema Migration Debt

- Severity: High
- Trigger: early ledger shape changes without versioning
- Impact: existing repository recognition history becomes hard to read
- Mitigation: schema version every ledger entry; migration command before stable 1.0; contract tests
- Current control: ADR 0037 provides the manifest-backed migration gate, and ADR 0055 requires every
  persisted version registered at `v1.0.0` to remain readable throughout the v1 Action line

## R10: Maintainer UX Fatigue

- Severity: Medium
- Trigger: proposed recognition PRs are noisy, generic, or too frequent
- Impact: maintainers disable the Action
- Mitigation: dry-run summaries, reviewable proposal pull requests, draft inbox review, configurable
  thresholds, concise recognition text, and explicit approval workflow
