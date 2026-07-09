# CLI Tool

- Status: Draft
- Repository Type: cli-tool

## Purpose

The Clarissimi CLI gives maintainers a local, reviewable way to validate configuration, validate the
recognition ledger, run fixture-based recognition, import agent-authored recognition drafts, rebuild
derived outputs, and inspect maintainer-only analytics.

The CLI is an orchestration shell. It must not own domain policy that belongs in schemas, core,
redaction, providers, or renderers.

## MVP Commands

- `clarissimi help`
- `clarissimi --help`
- `clarissimi validate-config`
- `clarissimi validate-ledger`
- `clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run [--config <path>]`
- `clarissimi stage-draft --draft <path>`
- `clarissimi approve-draft --draft <path>`
- `clarissimi import-draft --draft <path>`
- `clarissimi rebuild`
- `clarissimi analytics recent-share`

Fixture-first behavior is acceptable for the first implementation. `--fixture` accepts Clarissimi's
internal evidence fixture shape. `--github-fixture` accepts a GitHub-shaped merged pull request
fixture and routes it through `packages/github` without live GitHub API access.

The fixture-first CLI implements these commands locally without GitHub API access or live provider
credentials.

`import-draft` is the agent-assisted path: a maintainer can ask Codex, Claude Code, Grok, OpenCode,
or another already-running AI coding agent to inspect a PR and produce a Clarissimi assessment JSON
document. The CLI validates that document and records it only when it already carries an approved
or auto-approved maintainer status.

`stage-draft` is the review-inbox path: the same agent-authored JSON can be validated and copied to
`.clarissimi/drafts/` while it still has `maintainerApprovalStatus: "draft"`. The staged copy strips
raw evidence excerpts and does not preserve AI/provider provenance. Maintainers can review and edit
that file, run `approve-draft` to mark it approved, and then pass it to `import-draft`.

`approve-draft` is the maintainer approval helper. It rewrites a selected draft file as a sanitized
approved assessment, but it does not import the record, rebuild public outputs, call providers, or
create GitHub pull requests.

`analytics recent-share` is a maintainer-only local report. It calculates recent recognition-weight
share from approved ledger records and writes only to stdout. It must not be treated as public
contributor ranking output.

The public ledger format is documented in [`ledger-format.md`](ledger-format.md). The ledger stores
PR numbers in `source.pullRequestNumber`, PR URLs in `evidenceRefs`, and no public contributor
scores, average scores, ranks, or leaderboard fields.

If the current agent delegates drafting to another LLM, it may wrap the assessment in
`clarissimi.draft-envelope/v1`. Clarissimi accepts the wrapper but records only the validated
assessment in public outputs.

## Output Contract

- Human output should be concise and reviewable.
- JSON output must be machine-readable and must not expose raw provider output by default.
- Errors must avoid leaking secrets, raw diffs, raw comments, or private environment values.

## Config Contract

The CLI should support:

- `clarissimi.config.ts`
- `.clarissimi/config.json`

Config precedence, defaults, and schema versioning are owned by `packages/schemas`.

The current CLI validates either `clarissimi.config.ts` or `.clarissimi/config.json`. If both
default config files exist, the CLI fails closed and requires `--config <path>` so maintainers do
not accidentally switch provider or mode settings during migration. TypeScript config files must
export a default config object and still must not contain provider tokens or GitHub tokens.

## Review Blockers

- A command changes without updating help, examples, output, and exit-code expectations.
- JSON output exposes raw evidence, generated secrets, or provider raw responses.
- Runtime compatibility changes without smoke validation.
- CLI logic duplicates core policy.
