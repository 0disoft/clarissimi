# Command Contract

- Status: Draft
- Repository Type: cli-tool

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Ledger decision: `docs/adr/0002-contract-source-of-truth.md`
- AI boundary: `docs/adr/0003-ai-as-drafter-not-judge.md`
- Redaction boundary: `docs/adr/0006-redaction-before-provider.md`
- Provider boundary: `docs/adr/0019-add-openai-compatible-provider-adapter.md`
- Agent-assisted import boundary: `docs/adr/0020-add-agent-assisted-draft-import.md`
- Draft inbox boundary: `docs/adr/0021-add-draft-inbox-staging.md`
- Draft approval helper: `docs/adr/0024-add-draft-approval-helper.md`
- Config schema boundary: `docs/adr/0025-centralize-config-schema-validation.md`
- Maintainer analytics boundary: `docs/adr/0026-add-maintainer-recent-share-analytics.md`

## MVP Commands

### `clarissimi help` and `clarissimi --help`

Prints the current command list and common flags. Help output is informational and must not read
configuration files, ledger files, provider credentials, GitHub tokens, or repository evidence.

### `clarissimi validate-config`

Validates Clarissimi configuration without collecting GitHub evidence or calling a provider.

The fixture-first implementation validates `.clarissimi/config.json`. TypeScript config loading is
deferred until a safe loader decision exists.

### `clarissimi validate-ledger`

Validates `.clarissimi/contributions.jsonl` schema versions, required fields, and parseability.
It also rejects duplicate public records with the same contributor platform, contributor id,
repository, event, and pull request number.

### `clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run [--config <path>]`

Runs a fixture-based recognition flow. The default provider is the deterministic fake provider.

`--fixture` accepts Clarissimi's internal evidence fixture shape: contributor identity, prepared
evidence input, optional provider hints, and optional maintainer approval status.

`--github-fixture` accepts a GitHub-shaped merged pull request fixture and routes it through
`packages/github` before redaction and fake-provider drafting. It does not call the live GitHub API,
read tokens, or infer linked issues and review comments.

The fixture-first implementation does not write files in this command. If a fixture explicitly
contains approved maintainer status, the command may render public output previews.

Provider selection flags:

- `--provider fake`: default deterministic provider for tests and local correctness checks
- `--provider openai-compatible`: explicit live provider path
- `--provider-model <model>`: required for `openai-compatible`
- `--provider-endpoint <url>`: optional OpenAI-compatible chat completions endpoint
- `--provider-thinking disabled`: optional compatibility setting for providers that emit hidden
  reasoning in message content unless thinking is disabled

`openai-compatible` requires `CLARISSIMI_PROVIDER_TOKEN` in the process environment. Provider
tokens must not be stored in config files or passed as command-line arguments.

### `clarissimi rebuild`

Rebuilds derived outputs from `.clarissimi/contributions.jsonl`.

The fixture-first implementation previews rebuilds by default and writes files only when `--out-dir`
is explicit. Rebuild fails before writing derived outputs when the selected ledger contains
duplicate contribution identities.

### `clarissimi analytics recent-share`

Calculates maintainer-only recent recognition share from approved ledger records.

By default, the command reads `.clarissimi/contributions.jsonl`, uses a 90-day window ending at the
current time, and writes only to stdout. `--as-of <iso-date>` makes the window deterministic for
release retrospectives or tests. `--window-days <days>` changes the lookback window.

The command may report internal recognition weight and recognition share for maintainer review. It
must not write `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, static public JSON, or any public
scoreboard artifact.

### `clarissimi stage-draft --draft <path>`

Stages an agent-authored `clarissimi.assessment/v1` JSON draft for maintainer review under
`.clarissimi/drafts/`.

The draft file may also be a `clarissimi.draft-envelope/v1` object with an `assessment` field. The
command validates the contained assessment, accepts only `maintainerApprovalStatus: "draft"`, strips
raw evidence excerpts, and writes a deterministic review file based on repository, event, and pull
request number. It refuses to overwrite an existing staged draft by default.

The command does not import records into `.clarissimi/contributions.jsonl`, decide approval, call
providers, fetch GitHub evidence, create pull requests, or store AI/provider provenance.

By default, `--drafts-dir` is `.clarissimi/drafts`.

### `clarissimi approve-draft --draft <path>`

Approves a staged draft after maintainer review by rewriting the selected file as a sanitized
`clarissimi.assessment/v1` document with `maintainerApprovalStatus: "approved"`.

The draft file may also be a `clarissimi.draft-envelope/v1` object with an `assessment` field. The
command validates the contained assessment, accepts only current `draft` approval status, strips raw
evidence excerpts, omits AI/provider provenance, and writes only the approved assessment document.

The command does not import records into `.clarissimi/contributions.jsonl`, rebuild derived public
outputs, decide approval without maintainer intent, call providers, fetch GitHub evidence, mutate
branches, or create pull requests. Use `import-draft` after this command to publish the approved
record into the ledger.

### `clarissimi import-draft --draft <path>`

Imports an agent-authored `clarissimi.assessment/v1` JSON draft. This command is for workflows
where a maintainer gives a PR or issue URL to an already-running AI coding agent, and the agent
returns a Clarissimi-compatible assessment document.

The draft file may also be a `clarissimi.draft-envelope/v1` object with an `assessment` field. This
allows an agent to delegate drafting to another LLM and include local provenance metadata without
putting that provenance in the public ledger.

The command validates the draft, rejects non-public approval states, appends the sanitized public
record to the selected ledger, refuses duplicate contributor/source pull request records, and
rebuilds derived outputs. It does not call providers, read provider tokens, fetch GitHub evidence,
decide approval, mutate branches, create pull requests, or store AI/provider provenance in public
recognition records.

By default, `--ledger` is `.clarissimi/contributions.jsonl`. The override is for local validation,
test fixtures, and recovery workflows; it is not an MVP monthly or yearly partition mode. Public
derived outputs still use the canonical Clarissimi output paths when `--out-dir` is explicit.

## Modes

- `dry-run`: writes no recognition files
- `propose`: prepares changes for maintainer review
- `commit`: reserved future direct-write mode; current CLI commands do not write recognition files
  directly to the current branch

## Exit Codes

The implemented CLI exit-code taxonomy is:

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | usage error |
| `2` | invalid config |
| `3` | invalid ledger |
| `4` | provider or fixture recognition failure |
| `5` | provider schema validation failure |
| `6` | policy rejection |
| `7` | write failure |

The initial numeric values are recorded in `docs/adr/0014-add-fixture-first-cli-package.md` and
implemented in `packages/cli/src/exit-codes.ts`.

## Review Blockers

- A command writes public recognition without approval or configured policy.
- A draft staging command writes into the public ledger.
- A command sends provider input before redaction.
- A command uses live LLM tests as core correctness tests.
- A command exposes raw provider output by default.
