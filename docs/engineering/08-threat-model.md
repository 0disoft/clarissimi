# Threat Model

- Status: Draft

## Contract

The threat model names untrusted inputs, sensitive outputs, trust boundaries, mitigations, and
review blockers for the MVP.

Untrusted inputs:

- pull request titles, bodies, labels, comments, review comments, linked issue text, commit
  messages, changed file metadata, and patch excerpts
- provider responses
- local draft JSON written by agents or maintainers
- GitHub event payloads
- config files in the repository

Sensitive outputs:

- provider tokens and GitHub tokens
- raw provider responses
- raw diffs and patch excerpts
- private keys and environment files
- sensitive security vulnerability details
- personal email addresses detected by redaction

Trust boundaries and mitigations:

| Boundary | Risk | Mitigation |
| --- | --- | --- |
| Repository evidence to provider input | prompt injection, secrets, oversized evidence | prepare and redact evidence before provider calls |
| Provider output to assessment | malformed or overreaching claims | schema validation and maintainer approval |
| Draft inbox to public ledger | unapproved recognition | `import-draft` rejects draft, rejected, skipped, and duplicate records |
| Action write mode to repository | default-branch mutation or unsafe files | staging, branch writer, publisher, pull request boundaries |
| Logs and summaries | secret or raw evidence leakage | bounded outputs and no raw provider bodies |

## Required Evidence

- Source of truth: `docs/product/02-spec.md`, `docs/adr/0003-ai-as-drafter-not-judge.md`,
  `docs/adr/0006-redaction-before-provider.md`, `docs/ops/secrets.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run smoke`, `pnpm run check`,
  `pnpm run contract`, secret scan
- Related checklist: `.agents/checklists/security.md`

## Review Blockers

- A change trusts provider output as final approval.
- A change sends unredacted repository evidence to a live provider.
- A change stores AI/provider provenance in public recognition output.
- A change executes untrusted PR head code.
