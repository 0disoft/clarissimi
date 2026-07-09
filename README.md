# Clarissimi

[![Clarissimi dry run](https://github.com/0disoft/clarissimi/actions/workflows/clarissimi-dry-run.yml/badge.svg?branch=main)](https://github.com/0disoft/clarissimi/actions/workflows/clarissimi-dry-run.yml)

- Status: Fixture-first MVP with live GitHub collector and proposal boundaries
- Scope: public open-source repositories
- Repository Type: monorepo
- Addons: cli-tool, github-action

Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories.
It records meaningful merged contributions as project history instead of letting them disappear into
merge logs.

Clarissimi is not a contributor scoring leaderboard, an HR scorecard, or an AI code review tool.
AI is used as a drafter that reads repository evidence and prepares a structured recognition draft.
Maintainers remain the approval authority.

## Product Promise

After a pull request is merged, Clarissimi helps answer:

- What problem did this contribution solve?
- Which part of the project did it affect?
- What kind of contribution was it: bug fix, reproduction, test, performance, docs, security,
  accessibility, API design, maintenance, release validation, example, translation, or something else?
- Which public recognition text can a maintainer safely approve?

Public output should read like contribution history, not a scoreboard. Examples of good public
phrasing are:

- "Turned a hard-to-reproduce bug into a tested case."
- "Reduced a performance bottleneck in a hot path."
- "Lowered the documentation entry barrier."
- "Added regression coverage that protects future releases."

## MVP Shape

The first product slice is an installable GitHub Action plus a local TypeScript CLI.
It targets public GitHub repositories first and stores approved recognition records in the target
repository.

The initial source-of-truth output is:

- `.clarissimi/contributions.jsonl`: append-only recognition ledger
- `.clarissimi/contributors.json`: derived contributor profile data
- `CONTRIBUTORS.md`: maintainer-approved public recognition section
- static JSON data for future GitHub Pages rendering

The default write mode should be `propose`: Clarissimi opens a pull request with recognition
changes, and the maintainer decides whether to merge it. Direct commit mode can exist for small
personal repositories but must not be the default.

## Repository Shape

This repository is a single public-ready monorepo. The intended implementation packages are:

- `packages/schemas`: config, evidence, assessment, ledger, contributor, and approval schemas
- `packages/core`: pure policy, normalization, aggregation, and recognition logic
- `packages/redaction`: secret, email, private-key, and environment-file redaction
- `packages/github`: GitHub event and evidence collection
- `packages/providers`: fake deterministic provider and SDK-free OpenAI-compatible provider adapter
- `packages/renderers`: JSONL, JSON, Markdown, and static-data renderers
- `packages/cli`: local commands and orchestration
- `packages/action`: thin GitHub Action entrypoint

The Action and CLI are execution shells. They must not own domain policy.

Implemented MVP slices:

- `packages/schemas`: TypeScript vocabulary and runtime validation for config values and
  contribution assessment drafts
- `packages/core`: pure policy glue for prepared evidence and approval gates
- `packages/redaction`: deterministic redaction for evidence text and JSON-like values before
  provider calls
- `packages/github`: fixture-first and injected-client live GitHub merged pull request evidence
  collection
- `packages/providers`: provider adapter interface, deterministic fake contribution draft provider
  for tests and fixture-first workflows, and SDK-free OpenAI-compatible HTTP adapter
- `packages/renderers`: deterministic JSONL, contributor JSON, Markdown, static-data output, and
  draft review rendering
- `packages/cli`: fixture-first local command orchestration for validation, recognition dry runs,
  agent-assisted draft staging, approval, import, rebuild previews, and help output
- `packages/action`: GitHub Action entrypoint for dry-run summaries, fixture-first proposal
  branch/pull-request flows, draft review proposals, and event-path live GitHub collection in write
  modes

Not implemented yet:

- hosted manual live-provider smoke workflow evidence for automated provider-mode public release
- repository write modes such as direct `commit`
- comment updates or default-branch mutation

## Fixture-First CLI

The first CLI slice runs without GitHub API access or live LLM credentials:

```powershell
pnpm --filter @clarissimi/cli build
node packages/cli/dist/bin/clarissimi.js recognize --fixture fixtures/merged-pr-basic.json --mode dry-run --json
node packages/cli/dist/bin/clarissimi.js recognize --github-fixture fixtures/github-merged-pr-basic.json --mode dry-run --json
```

The command creates a deterministic fake-provider assessment from either a Clarissimi evidence
fixture or a GitHub-shaped merged pull request fixture. Public output previews are rendered only
when the fixture explicitly carries maintainer approval.

For the agent-assisted path, use an already-running AI coding agent to inspect a PR or issue and
produce a `clarissimi.assessment/v1` JSON draft. The agent may draft directly or delegate that
assessment to another LLM. Clarissimi can then validate and record the maintainer-approved draft
without owning the agent's API key:

```powershell
node packages/cli/dist/bin/clarissimi.js import-draft --draft agent-draft.json --out-dir . --json
```

`import-draft` rejects unapproved drafts and duplicate contributor/source records before writing
the ledger. It also accepts a `clarissimi.draft-envelope/v1` wrapper for delegated LLM workflows,
but public outputs record only the validated assessment.

To keep an unapproved draft in a reviewable repository inbox first:

```powershell
node packages/cli/dist/bin/clarissimi.js stage-draft --draft agent-draft.json --json
node packages/cli/dist/bin/clarissimi.js approve-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --json
node packages/cli/dist/bin/clarissimi.js import-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --out-dir . --json
```

`stage-draft` writes a sanitized copy to `.clarissimi/drafts/` and leaves
`.clarissimi/contributions.jsonl` untouched. A maintainer can review the staged file, run
`approve-draft` to mark it approved, and then import that reviewed file.

## GitHub Action

The Action package runs dry-run summaries without GitHub API writes, live provider credentials, or
repository file changes:

```powershell
pnpm --filter @clarissimi/action build
$env:INPUT_GITHUB_FIXTURE = "fixtures/github-merged-pr-basic.json"
node packages/action/dist/bin/clarissimi-action.js
```

The Action also accepts `GITHUB_EVENT_PATH` for a merged pull request event payload. It emits a
bounded dry-run summary and does not render public outputs or propose repository changes in
`dry-run` mode.

The root `action.yml` defaults to `propose` mode and still supports explicit `dry-run` and
`stage-draft` modes. Propose mode requires explicit write permissions, an approved or auto-approved
fixture, and a checked-out repository. It stages public output, publishes
`clarissimi/recognition/<source-kind>-<source-id>`, and opens or updates a pull request for
maintainer review.

Stage-draft mode requires the same checked-out repository and write permissions, but it stages only
`.clarissimi/drafts/*.json`, publishes `clarissimi/drafts/<source-kind>-<source-id>`, and opens or
updates a draft review pull request. It leaves `.clarissimi/contributions.jsonl`, `CONTRIBUTORS.md`,
contributor JSON, and static public data untouched.

When `propose` or `stage-draft` receives `GITHUB_EVENT_PATH`, it routes the merged pull request
through the live GitHub collector using `GITHUB_TOKEN`; fixture inputs remain the deterministic test
and local path. Explicit OpenAI-compatible provider selection is available for CLI and Action runs,
but it requires the caller to provide a model and `CLARISSIMI_PROVIDER_TOKEN`; correctness tests
continue to use fake providers or injected fetch implementations. Providers that emit hidden
reasoning in message content can opt into `provider-thinking: disabled` or `--provider-thinking
disabled`.

Release maintainers who want automated provider mode can run `pnpm run live-provider-smoke` with
`CLARISSIMI_PROVIDER_TOKEN` and `CLARISSIMI_PROVIDER_MODEL` to perform an explicit credentialed
provider smoke. Set `CLARISSIMI_PROVIDER_THINKING=disabled` only for compatible providers that need
that request option to return strict JSON. This command is not part of normal correctness checks and
is not required for the agent-assisted import workflow. Public package publication and versioned
Action tags also require the hosted manual live-provider smoke workflow described in
`docs/ops/release.md`; after configuring the repository secret, maintainers can run
`pnpm run hosted-live-provider-smoke -- --model <provider-model>`.

Workflow examples and permission details live in `docs/github-action/README.md` and
`docs/github-action/permissions.md`.

## Design Sources

- Product contract: `docs/product/02-spec.md`
- Roadmap: `docs/product/01-roadmap.md`
- Implementation tracker: `docs/product/04-implementation-tracker.md`
- Risk register: `docs/product/03-risk-register.md`
- System boundary: `docs/architecture/00-system-boundary.md`
- Domain model: `docs/architecture/01-domain-model.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Architecture decisions: `docs/adr/*.md`
- Package ownership: `docs/monorepo/package-ownership.md`
- License: `LICENSE`
- Notices: `NOTICE`
- Security policy: `SECURITY.md`
- Privacy policy: `PRIVACY.md`
- Contributing guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`

## Non-Goals

- Public numeric contributor score
- Global contributor leaderboard
- Public contributor ranking or tiering
- Automatic security severity judgment without maintainer confirmation
- Hosted SaaS, billing, organization dashboard, or external database in the MVP
- GitLab, Bitbucket, or private repository optimization in the MVP
- Running untrusted pull request head code

## Repository Hygiene

`.editorconfig`, `.gitattributes`, and `.gitignore` keep line endings, binary diffs, local files,
build outputs, caches, and secret files under control.

Project-specific implementation choices belong in the product, architecture, and ADR documents
before code is generated.

## Validation

The current executable checks are:

- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run contract`
- `pnpm run smoke`
- `pnpm run docs`
- `pnpm run check`
- `pnpm run release-readiness`

Release-only credentialed checks are:

- `pnpm run live-provider-smoke`
- `pnpm run hosted-live-provider-smoke -- --model <provider-model>`

Unimplemented validation names intentionally fail until configured.

`package.json` is project-owned after the first implementation package. `ssealed doctor` remains
useful for scaffold provenance, but it is not the implementation merge gate once runner scripts are
customized for real packages.

## License

Clarissimi is licensed under Apache-2.0.

See `NOTICE` for attribution notes and third-party notice handling.
