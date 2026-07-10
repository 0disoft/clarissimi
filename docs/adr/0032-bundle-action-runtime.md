# ADR 0032: Bundle the Action Runtime

- Status: Accepted
- Owner: Repository maintainers

## Context

The first public Action release builds the private workspace packages from tagged source on every
consumer run. That requires Corepack, pnpm, registry access, dependency installation, and a
TypeScript build before Clarissimi can process the event. The release passed repository-owned
dogfood and hosted smoke checks, but the runtime installation path adds avoidable latency and makes
consumer success depend on package-registry and package-manager availability.

The composite Action boundary still provides useful secret handling. It injects `github.token` only
for write modes and keeps provider credentials in the caller's environment rather than exposing
either token as an Action input.

## Decision

Keep the root Action as a composite Action, but execute a committed JavaScript bundle at
`action-dist/index.js`.

- Build the bundle from `packages/action/dist/bin/clarissimi-action.js` and its workspace
  dependencies with the repository-pinned esbuild version.
- Allow only esbuild's pinned install script through `pnpm-workspace.yaml`; it installs the
  platform-specific bundler binary used by repository maintainers and CI, never by Action consumers.
- Target Node.js 24 and keep the bundle readable rather than minified.
- Generate the bundle only through `pnpm run bundle:action`.
- Verify byte-for-byte bundle freshness through `pnpm run bundle:action:check` in release readiness
  and hosted CI.
- Exclude the generated bundle from source lint; lint the source graph and verify the derived bundle
  through freshness checks and direct execution smoke instead.
- Treat `packages/*/dist`, TypeScript build information, coverage, caches, and dependency trees as
  forbidden tracked output. `action-dist/index.js` is the sole reviewed release-artifact exception.
- Keep `GITHUB_TOKEN` and `CLARISSIMI_PROVIDER_TOKEN` environment mappings in the composite Action;
  do not add secret-valued Action inputs.

## Consequences

Consumer runs no longer install dependencies or compile TypeScript. They invoke the committed
bundle directly, reducing startup work and removing live package-registry availability from the
Action execution path.

The repository now owns a generated release artifact. Source remains authoritative; a stale or
hand-edited bundle fails validation. Any source change that affects the Action dependency graph must
regenerate and review the bundle before merge or release.

The composite shell remains Bash, so this decision does not claim Windows runner support. Runner
support must be documented and expanded only with consumer-level evidence.

## Validation

- `pnpm run bundle:action:check`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
- external consumer smoke using the next immutable Action tag
