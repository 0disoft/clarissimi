# Roadmap

- Status: Draft
- Owner: Repository maintainers

## Roadmap Principle

Build the trust surface before building automation volume. Clarissimi must be credible as a
recognition record engine before it expands into dashboards, graphs, or hosted services.

## Milestone 1: Product and Architecture Skeleton

Goal: make the repository understandable as a recognition engine, not a scoring tool.

Done when:

- README explains after-merge recognition and explicitly rejects public leaderboards.
- Product principles, system boundary, domain model, runtime flow, and risk register are populated.
- ADRs record public monorepo, Action-first, AI-as-drafter, no-leaderboard, JSONL-ledger,
  provider-boundary, and redaction-before-provider decisions.
- No implementation source code is required for this milestone.

Validation:

- `docs`
- `check`
- `ssealed doctor`

## Milestone 2: Schemas and Pure Core

Goal: define the data contracts before touching GitHub or LLM providers.

Done when:

- `ClarissimiConfig`, `ContributionType`, `ImpactLevel`, `ApprovalState`, `Contributor`,
  `EvidenceRef`, `AssessmentDraft`, `RecognitionEntry`, `LedgerEntry`, and `ContributorProfile`
  schemas exist.
- Core functions can turn deterministic fixture input into a recognition entry.
- Public APIs avoid numeric contributor scores.

Validation:

- `typecheck`
- `test`
- `contract`

## Milestone 3: Fixture-First CLI

Goal: prove the workflow without live GitHub or live LLM dependency.

Done when:

- `clarissimi validate-config`
- `clarissimi validate-ledger`
- `clarissimi recognize --fixture <path> --mode dry-run`
- `clarissimi rebuild`
- fake provider produces deterministic assessment drafts for fixtures

Validation:

- `typecheck`
- `test`
- `smoke`

## Milestone 4: Redaction and Provider Boundary

Goal: enforce the privacy boundary before provider calls become useful.

Done when:

- provider input always passes through redaction
- email, token, private key, and `.env` fixtures are redacted
- provider raw output is not logged by default
- OpenAI-compatible provider exists behind the provider interface
- local and fake providers remain viable

Validation:

- `test`
- `contract`
- `smoke`

## Milestone 5: GitHub Collector

Goal: collect enough repository evidence from merged pull requests.

Done when:

- PR title, body, author, labels, changed files, review comments, linked issue candidates, and merge
  commit metadata can be normalized into evidence refs
- fork PR head code is not executed
- `pull_request_target` is not the default path

Validation:

- `test`
- `contract`
- `smoke`

## Milestone 6: Renderers and Ledger

Goal: store approved recognition as repository-owned data.

Done when:

- `.clarissimi/contributions.jsonl` is append-only source of truth
- `.clarissimi/contributors.json` is derived
- `CONTRIBUTORS.md` rendering is idempotent
- running rebuild twice does not duplicate recognition entries

Validation:

- `test`
- `contract`
- `smoke`

## Milestone 7: GitHub Action

Goal: make Clarissimi installable in another repository.

Done when:

- `action.yml` exposes stable inputs and outputs
- default mode is `propose`
- least-privilege permissions are documented
- example workflow runs against a public repository scenario

Validation:

- `typecheck`
- `test`
- `smoke`

## Deferred

- hosted SaaS
- billing and team accounts
- organization-wide contributor graph
- public leaderboard
- GitLab and Bitbucket support
- private repository optimization
- Slack or Discord notifications
- badge image CDN
- automatic security severity judgment
