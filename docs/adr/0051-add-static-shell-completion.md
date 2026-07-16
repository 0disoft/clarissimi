# ADR 0051: Add Static Shell Completion

- Status: Accepted
- Date: 2026-07-15
- Owner: Repository maintainers

## Context

The CLI command names, option boundaries, and supported enum values are now stable enough to expose
shell completion. The previous shell-completion note deferred this work until those contracts and a
smoke boundary existed.

Generating completion from a second hand-maintained command list would let help, option rejection,
and completion drift apart. Dynamic completion that scans the current repository would also cross
Clarissimi's privacy boundary merely because a maintainer pressed Tab.

## Decision

- `clarissimi completion <bash|zsh|fish|powershell>` writes one deterministic completion script to
  stdout and performs no installation.
- The command supports Bash, Zsh, fish, and PowerShell. A missing shell, an unknown shell, extra
  positional arguments, or any unsupported option exits with the normal usage code `1`.
- `--help` keeps the normal CLI help behavior. `--json` is intentionally unsupported because the
  successful output is the shell program itself.
- CLI help, per-command option allowlists, and completion generation consume one typed command
  descriptor in `packages/cli`. Schema-owned provider and presentation values continue to come
  from `packages/schemas`.
- Generated scripts contain only static command, option, positional, and bounded enum candidates.
  They do not enumerate paths, inspect `.clarissimi`, load config, read environment variables, call
  a provider, access GitHub, or make network requests.
- Output uses LF line endings, ends with one newline, and contains no banner outside shell comments
  needed to identify the generated script.

## Consequences

- Maintainers can explicitly source or persist a script using their shell's normal mechanism.
- Adding or changing a CLI command requires updating one descriptor, with regression tests proving
  help and option validation remain aligned.
- Path-valued flags complete only the flag name. Native file discovery stays outside Clarissimi so
  completion cannot reveal repository filenames or generated recognition data.

## Validation

- descriptor uniqueness and help/option alignment tests
- deterministic generation and fail-closed argument tests for all four shells
- poisoned local config and injected credential/network boundary regression
- built-binary smoke generation for all four shells
- repository `docs`, `release-readiness`, `lint`, `format`, `smoke`, `check`, and `contract` gates
