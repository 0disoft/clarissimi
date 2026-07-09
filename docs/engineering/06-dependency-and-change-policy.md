# Dependency and Change Policy

- Status: Draft

## Contract

Dependency policy covers necessity, alternatives, license, maintenance health, vulnerabilities,
runtime impact, bundle impact, major upgrade policy, and removal cost.

Current policy:

- Prefer Node.js built-ins and existing workspace dependencies for MVP code.
- Do not add provider SDKs when the OpenAI-compatible HTTP boundary is sufficient.
- Do not add SaaS, database, queue, telemetry, dashboard, or hosting dependencies before an ADR
  accepts that product boundary.
- Dependency changes must update lockfiles, package ownership docs when needed, and validation
  evidence.
- Version-sensitive recommendations must check current package metadata before durable changes.
- Security-sensitive dependencies require a vulnerability and license review.
- Generated `dist/`, cache, and dependency folders are not source truth.

## Required Evidence

- Source of truth: `docs/monorepo/package-ownership.md`, `docs/ops/release.md`, `package.json`,
  `pnpm-lock.yaml`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run lint`, `pnpm run smoke`,
  `pnpm run check`, `pnpm run contract`
- Related checklist: `.agents/checklists/dependency.md`

## Review Blockers

- A dependency is added without a clear package boundary and validation evidence.
- A dependency handles secrets, network calls, or generated output without security review.
- A lockfile or package-manager version changes accidentally.
- A dependency is justified by convenience while a small existing boundary would suffice.
