# Contributing

- Status: Draft
- Owner: Maintainers

## Purpose

Clarissimi is a maintainer-approved contribution recognition engine. Contributions to this
repository should protect that identity: evidence first, public dignity first, and no public
scoreboard.

The project is currently a design scaffold. Changes should improve the product contract,
architecture, validation model, community policy, or future implementation boundaries without
inventing runtime behavior that the source-of-truth documents have not accepted yet.

## Source of Truth

- Product contract: docs/product/02-spec.md
- Roadmap: docs/product/01-roadmap.md
- Risk register: docs/product/03-risk-register.md
- Architecture decisions: docs/adr/*.md
- Validation names: VALIDATION.md
- Agent routing: .agents/context-map.md
- Code of conduct: CODE_OF_CONDUCT.md
- Security policy: SECURITY.md
- Privacy policy: PRIVACY.md

## What Helps

- Product language that makes Clarissimi clearer without drifting into contributor scoring.
- Evidence schema, rubric, approval, redaction, and storage decisions.
- CLI and GitHub Action contracts that keep policy in core packages instead of execution shells.
- Documentation that makes installation, review, security, privacy, and maintainer approval safer.
- Tests and validation plans once implementation packages exist.
- Issue reports that include repository evidence, expected behavior, actual behavior, and the
  smallest reproducible case available.

## What Does Not Help

- Public total score leaderboards.
- Public contributor rankings, tiers, or competitive badges.
- AI-only judgments about contributor value, security impact, or maintainer intent.
- Examples that include fake secrets, real secrets, private emails, tokens, private keys, or
  unreleased vulnerability details.
- Generated source code that pretends implementation choices are already decided.

## Contribution Flow

1. Check the source-of-truth documents above before proposing a change.
2. Open an issue for broad product, architecture, security, or privacy changes before a large
   pull request.
3. Keep pull requests narrow enough for maintainers to verify the evidence.
4. Update nearby docs when changing contracts, terminology, validation names, or public policy.
5. List the validation you ran and the validation you skipped with reasons.

## Documentation Standards

- Use plain language.
- Prefer "recognition", "contribution record", "evidence summary", and "maintainer approval"
  over "score", "rank", "grade", or "leaderboard".
- Keep public text focused on what changed in the project, not on judging a person.
- Mark undecided implementation choices as UNDECIDED instead of guessing.
- Do not publish confidential vulnerability details or private contributor data.

## Security and Privacy

Clarissimi is expected to read repository evidence and may later send minimized data to model
providers. Any contribution that touches evidence collection, redaction, provider calls, logs,
storage, or public rendering must explain how secrets and private information stay out of public
artifacts.

Security-sensitive reports should follow SECURITY.md. Privacy-sensitive changes should follow
PRIVACY.md and should preserve the default public-repository-first MVP boundary unless the
product contract is deliberately changed.

## Validation

Stable validation names live in VALIDATION.md. At this scaffold stage, generated runner scripts
may intentionally fail until real checks are configured. Do not replace unconfigured failing
validation commands with fake passing commands.

When implementation packages are added later, validation should cover the affected boundary:

- schemas and contracts
- core policy and rubric behavior
- redaction fixtures
- provider adapter behavior with deterministic fake providers
- CLI output, exit codes, and config loading
- GitHub Action inputs, permissions, and event handling

## Review Blockers

- The change invents product behavior without updating the product contract or ADRs.
- The change weakens validation or skips required evidence.
- The change adds public scoring, ranking, or tiering without an explicit product decision.
- The change sends more data to model providers without a documented minimization and redaction
  boundary.
- The change relies on generated, cache, or build output as source truth.
- The change includes secrets, fake credentials, private contact details, or security-sensitive
  exploit content.
