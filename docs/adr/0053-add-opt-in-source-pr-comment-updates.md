# ADR 0053: Add Opt-In Source Pull Request Comment Updates

- Status: Accepted
- Date: 2026-07-16

## Context

ADR 0017 deliberately left comment updates outside the first proposal write boundary. Clarissimi
can now create or update a deterministic proposal branch and pull request, but the merged source
pull request does not show where maintainers can review the resulting draft or recognition
proposal.

Blindly posting a new comment on every rerun would create notification noise. Updating any comment
that contains a public marker would let another actor trick Clarissimi into overwriting content it
does not own. Comment publication also happens after proposal creation, so failures need an
idempotent recovery path.

GitHub's issue-comment API applies to pull requests. Its create and update endpoints accept
`pull-requests: write`, which proposal modes already require:
<https://docs.github.com/en/rest/issues/comments>.

## Decision

- Add Action input `comment-mode` with values `none` and `upsert`. The default is `none`.
- `upsert` is supported only by `propose`, `stage-draft`, and `promote-draft`.
- After the proposal pull request is created or updated successfully, Clarissimi creates or updates
  one bounded status comment on the merged source pull request.
- The status comment contains only the proposal kind, proposal pull request number and URL, and a
  maintainer-approval reminder. It does not contain assessment prose, evidence text, patches,
  provider output, secrets, generated file contents, scores, or rankings.
- A managed comment must contain Clarissimi's versioned marker and be authored by
  `github-actions[bot]` through the `github-actions` app. Marker text alone never grants ownership.
- Clarissimi scans at most 1,000 comments in ten pages of 100. If the bounded scan is incomplete,
  or more than one managed comment exists, it fails without creating or overwriting a comment.
- Identical content is left unchanged. Changed managed content is updated in place.
- Comment creation is not blindly retried after an ambiguous network failure. Clarissimi first
  reconciles the comment list and returns the one matching Actions-owned comment when present;
  otherwise it fails so a later Action rerun can repeat the full bounded upsert.
- `source-comment-action` and `source-comment-url` expose the result when `upsert` is enabled.

## Boundaries

- `dry-run` never writes comments.
- `commit` does not support comment updates because a comment failure after an already-pushed
  direct commit cannot be retried through the same append-only recognition path safely.
- The feature uses the existing `pull-requests: write` permission. It does not require
  `issues: write`, `write-all`, `pull_request_target`, or a broader token.
- The built-in GitHub Actions token owns managed comments. Clarissimi does not overwrite comments
  from users, other bots, or other GitHub Apps.
- Comment failures do not roll back an already-published proposal branch or pull request. Rerunning
  the same proposal mode reconciles that deterministic branch and pull request before retrying the
  comment upsert.

## Consequences

- Maintainers can opt into one durable source-PR pointer without receiving a new bot comment on
  every workflow rerun.
- The default remains silent, preserving existing installations and permission examples.
- Repositories with more than 1,000 source-PR comments must resolve the comment state manually or
  leave the feature disabled.
- A repository that already has multiple genuine Clarissimi-managed comments must remove the
  duplicate before the Action can continue.

## Validation

- focused managed-comment ownership, spoofing, pagination, create, update, and unchanged tests
- proposal-runner integration test
- Action manifest, bundle freshness, docs, release-readiness, lint, format, smoke, check, and
  contract gates

## Review Blockers

- `comment-mode` defaults to a write behavior.
- Clarissimi overwrites marker-matching comments without proving GitHub Actions app ownership.
- Comment content includes raw evidence, assessment prose, provider output, patches, or secrets.
- Dry-run or direct commit mode writes a source pull request comment.
- The comment scan can grow without a hard page and item bound.
