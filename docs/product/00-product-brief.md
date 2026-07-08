# Product Brief

- Status: Draft
- Owner: Repository maintainers

## Purpose

Clarissimi helps open-source maintainers turn merged contributions into durable, evidence-backed
recognition records.

The product exists because many meaningful contributions disappear into pull request history after
merge. Clarissimi keeps those contributions visible in project-owned files without turning
contributors into ranked scores.

## Product Identity

Clarissimi is a maintainer-approved contribution recognition engine.

It is not:

- a contributor leaderboard
- a public numeric scoring tool
- an AI judge for people
- an AI code review replacement
- a maintainer replacement bot

AI acts as a clerk. It reads repository evidence and drafts structured recognition records.
Maintainers approve, edit, reject, or skip public recognition.

## Target Users

- Maintainers of public open-source repositories
- Contributors who want their work recognized as project history
- Project teams that want release notes, contributor profiles, and appreciation records grounded in
  repository evidence

## MVP Boundary

The first version supports public GitHub repositories through a GitHub Action and local CLI.

The MVP should handle merged pull requests first. Issue-only recognition, reviewer recognition,
co-author recognition, and reproduction-case recognition are allowed as future capabilities, but the
first implementation should keep PR author recognition as the default path.

## Success Criteria

Clarissimi succeeds when:

- maintainers spend less time writing appreciation and contributor notes after merge
- contributors can see what they helped change
- public recognition is based on linked repository evidence
- the project avoids scoreboards, rankings, and gameable public metrics
- the generated record is easy to review, edit, and reject

## Source of Truth

- Product specification: `docs/product/02-spec.md`
- Roadmap: `docs/product/01-roadmap.md`
- Risk register: `docs/product/03-risk-register.md`
- Architecture decisions: `docs/adr/*.md`
- Validation needed before merge: `VALIDATION.md`

## Review Blockers

- A change presents Clarissimi as contributor scoring or ranking.
- A change lets AI publish recognition without maintainer approval or policy.
- A public output exposes numeric contributor scores.
- Evidence claims cannot be traced to repository artifacts.
- Provider input can include secrets or sensitive security details before redaction.
