# CLI Tool

- Status: Draft
- Repository Type: cli-tool

## Purpose

The Clarissimi CLI gives maintainers a local, reviewable way to validate configuration, validate the
recognition ledger, run fixture-based recognition, and rebuild derived outputs.

The CLI is an orchestration shell. It must not own domain policy that belongs in schemas, core,
redaction, providers, or renderers.

## MVP Commands

- `clarissimi validate-config`
- `clarissimi validate-ledger`
- `clarissimi recognize --fixture <path> --mode dry-run`
- `clarissimi rebuild`

Fixture-first behavior is acceptable for the first implementation. Live GitHub collection can be
added after schemas, redaction, fake provider, and renderers are stable.

## Output Contract

- Human output should be concise and reviewable.
- JSON output must be machine-readable and must not expose raw provider output by default.
- Errors must avoid leaking secrets, raw diffs, raw comments, or private environment values.

## Config Contract

The CLI should support:

- `clarissimi.config.ts`
- `.clarissimi/config.json`

Config precedence, defaults, and schema versioning are owned by `packages/schemas`.

## Review Blockers

- A command changes without updating help, examples, output, and exit-code expectations.
- JSON output exposes raw evidence, generated secrets, or provider raw responses.
- Runtime compatibility changes without smoke validation.
- CLI logic duplicates core policy.
