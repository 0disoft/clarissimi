# Testing Standard

- Status: Draft

## Contract

Testing standard defines merge-blocking expectations for unit, integration, contract, smoke, docs,
and regression evidence.

Required validation by change type:

- Documentation-only changes: `pnpm run docs`, plus hygiene checks.
- CLI behavior changes: CLI tests, `pnpm run smoke`, `pnpm run check`, `pnpm run contract`.
- GitHub Action changes: Action tests, `actionlint`, workflow YAML parsing, `pnpm run smoke`,
  `pnpm run check`, `pnpm run contract`.
- Provider adapter changes: fake-fetch tests, no live credentials in correctness tests, `pnpm run
  check`, `pnpm run contract`.
- Renderer or ledger changes: renderer tests, rebuild/import tests, no-public-ranking checks.
- Release readiness changes: local validation plus relevant hosted workflow evidence.

Correctness tests must use deterministic fake providers, fixtures, fake clients, fake fetches, and
temporary repositories. `pnpm run live-provider-smoke` is a release smoke, not a correctness test.

## Required Evidence

- Source of truth: `VALIDATION.md`, `package.json`, `.github/workflows/ci.yml`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run smoke`, `pnpm run check`,
  `pnpm run contract`
- Related checklist: `.agents/skills/test-hardening/SKILL.md`

## Review Blockers

- A feature lands without tests or a stated skipped-test reason.
- A validation script returns fake success.
- Correctness tests require live provider credentials or live GitHub mutation.
- Hosted release evidence is claimed without workflow run URLs or local command evidence.
