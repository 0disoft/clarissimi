# Clarissimi

- Status: Design scaffold
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
- `packages/providers`: LLM provider adapters and fake deterministic provider
- `packages/renderers`: JSONL, JSON, Markdown, and static-data renderers
- `packages/cli`: local commands and orchestration
- `packages/action`: thin GitHub Action entrypoint

The Action and CLI are execution shells. They must not own domain policy.

Implemented packages:

- `packages/schemas`: TypeScript vocabulary and runtime validation for contribution assessment
  drafts
- `packages/core`: pure policy glue for prepared evidence and approval gates
- `packages/redaction`: deterministic redaction for evidence text and JSON-like values before
  provider calls
- `packages/providers`: provider adapter interface and deterministic fake contribution draft
  provider for tests and fixture-first workflows
- `packages/renderers`: deterministic JSONL, contributor JSON, Markdown, and static-data output
  rendering

## Design Sources

- Product contract: `docs/product/02-spec.md`
- Roadmap: `docs/product/01-roadmap.md`
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
- `pnpm run check`

Unimplemented validation names intentionally fail until configured.

`package.json` is project-owned after the first implementation package. `ssealed doctor` remains
useful for scaffold provenance, but it is not the implementation merge gate once runner scripts are
customized for real packages.

## License

Clarissimi is licensed under Apache-2.0.

See `NOTICE` for attribution notes and third-party notice handling.
