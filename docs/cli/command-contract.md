# Command Contract

- Status: Draft
- Repository Type: cli-tool

## Source of Truth

- Product behavior: `docs/product/02-spec.md`
- Runtime flow: `docs/architecture/02-runtime-flow.md`
- Ledger decision: `docs/adr/0002-contract-source-of-truth.md`
- AI boundary: `docs/adr/0003-ai-as-drafter-not-judge.md`
- Redaction boundary: `docs/adr/0006-redaction-before-provider.md`

## MVP Commands

### `clarissimi validate-config`

Validates Clarissimi configuration without collecting GitHub evidence or calling a provider.

The fixture-first implementation validates `.clarissimi/config.json`. TypeScript config loading is
deferred until a safe loader decision exists.

### `clarissimi validate-ledger`

Validates `.clarissimi/contributions.jsonl` schema versions, required fields, and parseability.

### `clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run`

Runs a fixture-based recognition flow. The first implementation may use only fixtures and fake
provider output.

`--fixture` accepts Clarissimi's internal evidence fixture shape: contributor identity, prepared
evidence input, optional provider hints, and optional maintainer approval status.

`--github-fixture` accepts a GitHub-shaped merged pull request fixture and routes it through
`packages/github` before redaction and fake-provider drafting. It does not call the live GitHub API,
read tokens, or infer linked issues and review comments.

The fixture-first implementation does not write files in this command. If a fixture explicitly
contains approved maintainer status, the command may render public output previews.

### `clarissimi rebuild`

Rebuilds derived outputs from `.clarissimi/contributions.jsonl`.

The fixture-first implementation previews rebuilds by default and writes files only when `--out-dir`
is explicit.

## Modes

- `dry-run`: writes no recognition files
- `propose`: prepares changes for maintainer review
- `commit`: writes directly only when explicitly configured

## Exit-Code Direction

The exact numeric taxonomy is not implemented yet. The first implementation should distinguish:

- success
- invalid configuration
- invalid ledger
- provider failure
- schema validation failure
- unsafe or redacted input failure
- write failure

Initial numeric values are recorded in `docs/adr/0014-add-fixture-first-cli-package.md`.

## Review Blockers

- A command writes public recognition without approval or configured policy.
- A command sends provider input before redaction.
- A command uses live LLM tests as core correctness tests.
- A command exposes raw provider output by default.
