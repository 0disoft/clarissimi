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

The source checkout additionally implements live collection and batch review (unreleased; not
available in the published `1.0.1` CLI):

```sh
clarissimi recognize --pr https://github.com/owner/project/pull/42 --mode dry-run --json
clarissimi recognize --repo owner/project --prs 42,43 --mode stage-draft
clarissimi review-drafts --review .clarissimi/review.json
# Read the saved manifest, including recognition text, evidence links and hashes.
clarissimi review-drafts --review .clarissimi/review.json --approve --out-dir .
```

The live path uses `GITHUB_TOKEN`, then `GH_TOKEN`, when set; public PRs also work without a token
within GitHub's unauthenticated limits. Only merged PRs on `github.com` are accepted, up to 25 per
call. No repository is checked out and no GitHub resource is written. `dry-run` writes nothing;
`stage-draft` creates inbox files exclusively. If a later file already exists, earlier saved paths
are reported so partial progress is visible. Existing drafts are never overwritten.

Large PRs fail by default. `--allow-partial` explicitly collects up to 100 files, reports a lower
bound for omitted files, and includes coverage in provider evidence. Review comment counts at
their limit are reported as possibly incomplete. Absence of the flag retains the strict behavior.

The review manifest is created outside the inbox and cannot overwrite an existing file. It
contains sanitized review records, not raw evidence excerpts. Review at most 25 pending drafts;
previously approved drafts with valid snapshots are skipped. Edit the inbox drafts and generate a
new manifest when prose needs changes. `--approve` checks both current and reviewed content hashes
and publishes the whole selected batch in one rendering/atomic replacement pass. One mismatch,
invalid record, duplicate ledger identity, or output conflict rejects the import. This local
explicit maintainer approval does not replace GitHub's Action permission or SHA review checks.

- `clarissimi help`
- `clarissimi --help`
- `clarissimi validate-config`
- `clarissimi validate-ledger`
- `clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run [--config <path>]`
- `clarissimi stage-draft --draft <path>`
- `clarissimi approve-draft --draft <path>`
- `clarissimi import-draft --draft <path>`
- `clarissimi rebuild`
- `clarissimi render-page --out-dir <path>`
- `clarissimi analytics recent-share`
- `clarissimi completion <bash|zsh|fish|powershell>`

Fixture-first behavior is acceptable for the first implementation. `--fixture` accepts Clarissimi's
internal evidence fixture shape. `--github-fixture` accepts a GitHub-shaped merged pull request
fixture and routes it through `packages/github` without live GitHub API access.

The fixture-first CLI implements these commands locally without GitHub API access or live provider
credentials.

`import-draft` is the agent-assisted path: a maintainer can ask Codex, Claude Code, Grok, OpenCode,
or another already-running AI coding agent to inspect a PR and produce a Clarissimi assessment JSON
document. The CLI validates that document and records it only when it carries a manually approved
maintainer status.

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

`completion` writes a deterministic Bash, Zsh, fish, or PowerShell completion program to stdout.
It does not install files, inspect the repository or environment, enumerate paths, or make network
requests. See [`shell-completion.md`](shell-completion.md) for session setup examples.

`render-page` writes one static `index.html` from the approved ledger. The command requires an
explicit output directory, includes evidence-linked human, bot, and AI-agent recognition by default,
and supports the existing display-only automation opt-out. It does not deploy the page, call a
provider, fetch GitHub data, or modify the ledger.

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
