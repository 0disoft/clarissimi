# ADR 0054: Reconcile Equivalent Proposal Branch Races

- Status: Accepted
- Date: 2026-07-17
- Owner: Repository maintainers

## Context

The source-comment race smoke ran two `promote-draft` jobs for the same approved source at the
same barrier. Both jobs rendered the same recognition files from the same base commit, but their
bot commits had different commit metadata and therefore different commit SHAs. One compare-and-swap
push won. The other correctly lost its lease, then failed before it could reconcile the managed
source comment even though the proposal branch content was already equivalent.

Blindly retrying or force-pushing would be unsafe. A losing run must not overwrite a maintainer edit,
accept output generated from another base, or hide a genuinely divergent recognition result.

## Decision

- Proposal branch publication keeps its existing explicit `--force-with-lease` compare-and-swap.
- A successful push reports the locally generated commit SHA as before.
- After a failed push, Clarissimi performs one bounded reconciliation instead of retrying the push.
- The remote winner is accepted only when all of these conditions hold:
  - the remote branch still exists and its tip can be fetched;
  - the fetched tip is the exact SHA observed after the lease failure;
  - the tip is either the recorded base commit or one direct child of that base commit;
  - the winner and losing local commit have identical Git trees; and
  - a final remote lookup proves the branch tip did not move during reconciliation.
- An accepted concurrent winner becomes the reported proposal commit SHA. Pull request and optional
  source-comment reconciliation then continue normally.
- Missing, malformed, moving, differently based, or content-divergent remote state preserves the
  original push failure. Clarissimi does not retry, merge, or force-push over it.

## Consequences

- Identical concurrent proposal runs converge without turning commit timestamp differences into a
  failed Action.
- Different recognition content or history still fails closed and requires maintainer review.
- Reconciliation performs bounded additional Git reads and one fetch only after a failed push.
- The proposal branch remains the shared compare-and-swap boundary; no process-local lock is
  mistaken for protection across runners.

## Validation

- deterministic injected interleaving where an equivalent writer wins after the loser observes its
  lease
- deterministic divergent-tree rejection under the same interleaving
- proposal runner output reports the actual published winner SHA
- Action bundle freshness plus repository format, lint, docs, smoke, check, contract, and release
  readiness gates
- hosted integration-lab source-comment race using the exact candidate commit SHA
