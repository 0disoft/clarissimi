# GitHub Action

- Status: Draft
- Repository Type: github-action

## Purpose

The GitHub Action is the installable automation surface for public repositories. It should collect
safe post-merge evidence, draft recognition, and either propose or explicitly commit
repository-owned recognition files.

The Action is a thin entrypoint. Domain logic belongs in core packages and the CLI orchestration
layer.

## Default Behavior

- Runs after merge or default-branch update.
- Reads explicit Action inputs and workflow environment values.
- Collects bounded public GitHub evidence.
- Runs redaction before provider calls.
- Validates provider output against schemas.
- Produces a dry-run summary, proposed recognition pull request, explicit direct commit, or
  proposed draft review pull request.

## Default Write Mode

`propose`

This means the Action should open a pull request with recognition changes instead of directly
committing to the default branch.

## Security Boundary

Avoid default `pull_request_target` behavior. Do not checkout or execute untrusted fork PR head
code.

## Action Usage

Use `0disoft/clarissimi@v0` for maintainer-approved `0.x` updates, or pin
`0disoft/clarissimi@v0.3.3` when exact patch reproducibility matters. The moving `main` ref is
reserved for this repository's development and dogfood workflows. Immutable version tags never
move.

The public [`clarissimi-example`](https://github.com/0disoft/clarissimi-example) consumer shows the
copyable read-only workflow, the manual least-privilege proposal workflow, and a merged synthetic
recognition result with the contributor summary table.

The current `action.yml` defaults to `propose` mode and also supports explicit read-only `dry-run`
plus write modes `commit` and `stage-draft`. The current `v0.3.3` release executes the committed
`action-dist/index.js` bundle without consumer-time package installation or TypeScript compilation. `v0.1.0` remains
immutable and retains its published source-build behavior. Dry-run mode emits a bounded summary and does not read provider credentials, use
GitHub write tokens, create branches, open pull requests, or update repository files. Propose mode
stages approved recognition output, publishes a proposal branch, and opens or updates a pull
request. Commit mode performs the same approved recognition rebuild and directly pushes one
bot-authored commit without force. Stage-draft mode stages only sanitized
`.clarissimi/drafts/*.json` review files and opens
or updates a draft review pull request. When `propose` or `stage-draft` receives
`GITHUB_EVENT_PATH`, it routes the merged pull request through the live GitHub collector using
`GITHUB_TOKEN`; fixture inputs remain the deterministic local and test path.

The composite launcher uses Bash. Ubuntu, macOS, and Windows have passed external dry-run and
full-write consumer smoke for immutable tag `v0.3.3` and moving alias `v0`.

The Action defaults to the fake provider when no provider input or config value is set. To use an
OpenAI-compatible provider, pass `provider: openai-compatible` and `provider-model`, or provide
those values through `config-path`. Expose `CLARISSIMI_PROVIDER_TOKEN` from the workflow secret
boundary. Do not pass provider tokens as action inputs.
Custom endpoints use public HTTPS trust by default. A trusted self-hosted HTTP or private-network
gateway also requires `provider-endpoint-trust: private-network`.

Repository config-file loading is explicit through `config-path`; the Action does not automatically
discover config files. Action inputs and workflow environment values take precedence over config
values.

Set `markdown-summary: table` to add a compact contributor totals table above the detailed
`CONTRIBUTORS.md` recognition sections. The default `none` layout preserves existing output. The
explicit input also applies to `promote-draft`, which does not load provider config. Immutable tag
`v0.3.3` includes both table and gallery layouts.

Set `markdown-summary: gallery` to show linked 64-pixel GitHub avatars above the same detailed
sections. Avatar URLs use stable contributor ids, and the gallery does not replace evidence links.

Approved bot and AI-agent contributors are included by default. Set
`include-automation-contributors: false` to hide them from derived contributor displays while
keeping their approved ledger records.

When a later workflow step needs a durable machine-readable summary, set `summary-path`. The path
must be relative to `GITHUB_WORKSPACE`, and the written JSON follows the same raw-evidence and
secret-exclusion rules as stdout, GitHub outputs, and the step summary.

Detailed outputs and failure behavior are defined in `docs/github-action/action-contract.md`. The
implemented propose-mode sequencing is recorded in
`docs/github-action/propose-implementation-plan.md`.

Example read-only workflow:

```yaml
name: Clarissimi dry run

on:
  pull_request:
    types:
      - closed

permissions:
  contents: read
  pull-requests: read
  issues: read

jobs:
  recognize:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: 0disoft/clarissimi@v0.3.3
        with:
          mode: dry-run
```

Example explicit OpenAI-compatible provider dry run:

```yaml
steps:
  - uses: 0disoft/clarissimi@v0.3.3
    env:
      CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}
    with:
      mode: dry-run
      provider: openai-compatible
      provider-model: ${{ vars.CLARISSIMI_PROVIDER_MODEL }}
```

For local fixture checks, pass `github-fixture`:

```yaml
- uses: 0disoft/clarissimi@v0.3.3
  with:
    mode: dry-run
    github-fixture: fixtures/github-merged-pr-basic.json
```

For local or CI checks against a GitHub event payload file, pass `event-path`:

```yaml
- uses: 0disoft/clarissimi@v0.3.3
  with:
    mode: dry-run
    event-path: fixtures/github-pull-request-merged-event.json
```

This repository dogfoods the root Action with both `github-fixture` and `event-path` inputs in
`.github/workflows/clarissimi-dry-run.yml`.

To share provider settings with the local CLI, pass an explicit config path and keep the provider
token in the workflow secret boundary:

```yaml
steps:
  - uses: 0disoft/clarissimi@v0.3.3
    env:
      CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}
    with:
      mode: dry-run
      config-path: .clarissimi/config.json
```

To upload the sanitized JSON summary as a workflow artifact:

```yaml
steps:
  - id: clarissimi
    uses: 0disoft/clarissimi@v0.3.3
    with:
      mode: dry-run
      summary-path: .clarissimi/run-summary.json
  - uses: actions/upload-artifact@v6
    with:
      name: clarissimi-summary
      path: ${{ steps.clarissimi.outputs.summary-json-path }}
```

Propose mode against a merged pull request event requires checkout, explicit write permissions, and
repository settings that allow GitHub Actions to create pull requests:

```yaml
name: Clarissimi propose

on:
  pull_request:
    types:
      - closed

permissions:
  contents: write
  pull-requests: write
  issues: read

jobs:
  recognize:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: 0disoft/clarissimi@v0.3.3
        with:
          mode: propose
          base-branch: main
```

Fixture-first propose mode requires an approved or auto-approved fixture and the same write
permissions:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: read

steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0
  - uses: 0disoft/clarissimi@v0.3.3
    with:
      mode: propose
      github-fixture: fixtures/github-merged-pr-approved.json
      base-branch: main
```

Explicit commit mode removes the proposal round trip. It requires only repository content write
permission beyond the read permissions used for evidence collection. Pin a release or commit that
contains ADR 0038; immutable `v0.1.1` does not contain this mode.

```yaml
permissions:
  contents: write
  pull-requests: read
  issues: read

steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0
  - uses: 0disoft/clarissimi@v0.3.3
    with:
      mode: commit
      base-branch: main
```

The checkout must be clean and must still point at `GITHUB_SHA`. Clarissimi creates no commit when
the deterministic rebuild is unchanged, never force-pushes, and fails when the target branch
advanced or branch protection rejects the update.

Stage-draft mode proposes an unapproved draft inbox file for maintainer review. It uses the same
write permissions as propose mode but does not update public recognition outputs:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: read

steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0
  - uses: 0disoft/clarissimi@v0.3.3
    with:
      mode: stage-draft
      base-branch: main
```

After the staged draft pull request is reviewed, its `maintainerApprovalStatus` is changed to
`approved` or `auto_approved`, and that pull request is merged, `promote-draft` can render a normal
public recognition proposal without another provider call. Use a manual workflow input so the
maintainer chooses the exact checked-in draft:

```yaml
name: Clarissimi promote approved draft

on:
  workflow_dispatch:
    inputs:
      draft-path:
        description: Approved draft path under .clarissimi/drafts/
        required: true
        type: string

permissions:
  contents: write
  pull-requests: write
  issues: read

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: 0disoft/clarissimi@v0.3.3
        with:
          mode: promote-draft
          draft-path: ${{ inputs.draft-path }}
          base-branch: main
```

`promote-draft` is available in immutable tag `v0.3.3`, which passed external consumer smoke. Do not
point production consumer workflows at `main` to get unreleased changes early.

This repository keeps write-mode dogfood manual-only in
`.github/workflows/clarissimi-propose-fixture.yml` and
`.github/workflows/clarissimi-stage-draft-fixture.yml`. Approved-draft promotion dogfood is
manual-only in `.github/workflows/clarissimi-promote-draft-fixture.yml`. Maintainers can trigger
them with `workflow_dispatch` to open or update deterministic proposal pull requests from fixture
inputs. The propose and promote workflows use approved fixtures, while the stage-draft workflow
uses an unapproved draft fixture. Do not replace the read-only dry-run dogfood workflow with these
write-mode workflows.

## Review Blockers

- Action permission changes lack least-privilege review.
- Action behavior bypasses redaction or schema validation.
- Outputs or exit behavior changes without workflow examples.
- The Action owns domain policy that should live in core packages.
