# ADR 0017: Define Propose Mode Write Boundary

- Status: Accepted
- Date: 2026-07-09
- Owner: Repository maintainers

## Context

ADR 0008 makes `propose` the default write mode, but the dry-run Action skeleton deliberately
does not write branches, commits, comments, pull requests, or recognition files yet. The next
implementation slice needs a narrower write contract before any code starts using the GitHub token
or mutating repository state.

Clarissimi recognition output is public project history. A write-mode mistake can publish an
unapproved recognition record, expose raw evidence, overwrite maintainer edits, or train users to
grant broad token permissions. `propose` mode must therefore behave like a reviewable repository
change request, not a bot silently updating the default branch.

## Decision

`propose` mode creates or updates a dedicated pull request containing recognition file changes for
maintainer review. It must not write directly to the default branch.

The first `propose` implementation must:

- run only after a safe post-merge event, explicit manual dispatch, or another event whose payload
  does not require checking out or executing untrusted pull request head code
- collect evidence, redact provider inputs, validate provider output, and apply policy before any
  repository write
- write only Clarissimi-owned recognition outputs:
  - `.clarissimi/contributions.jsonl`
  - `.clarissimi/contributors.json`
  - `CONTRIBUTORS.md`
  - future static data under a Clarissimi-owned output path
- create or update a branch named `clarissimi/recognition/<source-kind>-<source-id>`
- use a bot commit author that is clearly automation-owned
- create a pull request into the configured base branch with a title that starts with
  `Clarissimi recognition:`
- include a pull request body with:
  - source event or pull request reference
  - generated files changed
  - approval state summary
  - redaction match count
  - explicit note that maintainers own final approval
- fail closed before branch or pull request mutation when config, redaction, provider output,
  schema validation, policy evaluation, or renderer rebuild fails

`propose` mode must not:

- commit to the default branch
- publish draft recognition as approved
- include raw pull request bodies, raw diffs, raw patch excerpts, provider raw responses, tokens,
  private keys, or sensitive security details in pull request text, Action outputs, or step
  summaries
- request `write-all` permissions
- depend on `pull_request_target` as the default event path
- checkout or execute untrusted pull request head code
- approve, merge, or auto-close its own pull request

## Permission Contract

The minimum expected workflow permissions for `propose` mode are:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: read
```

`contents: write` is required to create or update the proposal branch. `pull-requests: write` is
required to open or update the proposal pull request. `issues: read` is read-only context for
linked issue evidence when enabled.

Repositories or organizations may also need to enable the GitHub Actions setting that allows
workflows to create pull requests. If that setting is disabled, Clarissimi must fail with an
actionable diagnostic rather than falling back to direct commits or broader credentials.

## Branch And Idempotency

The proposal branch name must be deterministic for the source event. Re-running the same source
event should update the existing proposal branch and pull request instead of creating duplicates.

If a proposal pull request already exists and contains maintainer edits, Clarissimi must avoid
overwriting those edits unless the edited files are wholly Clarissimi-owned and the renderer can
prove an idempotent rebuild. When that cannot be proven, the Action should stop and ask for manual
maintenance rather than force-pushing over review state.

## Rollback And Recovery

`propose` mode rollback is closing or deleting the proposal branch and pull request before merge.
No approved recognition record becomes durable until maintainers merge the proposal pull request
or otherwise apply the same generated changes through repository policy.

After merge, recovery follows the normal repository history model:

- revert the recognition pull request
- regenerate derived outputs from `.clarissimi/contributions.jsonl`
- open a correction pull request

## Future Work

The first implementation may support only one source event per proposal branch. Batch proposals,
comment updates, release-wide recognition summaries, GitHub App credentials, and direct `commit`
mode remain separate decisions.

## References

- GitHub workflow `permissions`: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
- GitHub token least-permission guidance: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
- GitHub Actions pull request creation setting: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
