# Performance Budget

- Status: Draft

## Contract

Performance budgets track local CLI latency, Action runtime cost, payload size, repeated I/O, and
provider or GitHub request pressure.

Current MVP budgets:

- Correctness tests must stay fixture-first and avoid live network calls.
- Provider input must be bounded prepared evidence, not full raw diffs or unbounded comments.
- GitHub collection must bound review comments, linked issue candidates, changed files, and patch
  excerpts before provider preparation.
- Live GitHub collection accepts at most 100 changed files.
- Provider preparation accepts at most 256 evidence items and 512 KiB of serialized UTF-8 evidence.
- The complete OpenAI-compatible provider request body accepts at most 1 MiB of UTF-8 data.
- Renderers should rebuild derived outputs from the canonical ledger in memory for the MVP.
- Combined recognition output generation should validate public records once, filter display records
  once, and reuse one contributor-profile aggregation across JSON, Markdown, and static output.
- Proposal branches should stage only Clarissimi-owned output files.
- Monthly ledger partitions are deferred until real repository volume justifies the extra lookup
  and migration complexity.

## Deterministic Scale Benchmark

`pnpm run benchmark:scale` builds the workspace and checks three in-memory hot paths against
deterministic ledgers containing 1,000 and 10,000 approved contribution records:

- CLI-equivalent ledger rebuild: parse JSONL, reject duplicate identities, and regenerate the
  canonical ledger, contributor JSON, contributor Markdown table, and static JSON from one
  validated record set and one contributor-profile aggregation.
- JSON redaction: traverse one structured item per contribution and redact one public test email
  address per item.
- Contributor Markdown rendering: aggregate ten contributions per contributor, including human,
  bot, and AI-agent identities, then render the summary table and contributor sections.

The check records output sizes and SHA-256 digests so an empty or skipped workload cannot look
fast. It runs one wall-clock sample per workload and enforces only generous runaway ceilings:
15,000 ms for the 1,000-record suite and 90,000 ms for the 10,000-record suite. These ceilings are
regression guards for catastrophic growth, not product latency promises.

`pnpm run benchmark:scale:sample` runs three samples and reports each sample, median, maximum,
runtime, operating system, and architecture as JSON. Those numbers describe only the machine and
load that produced that invocation. Do not copy a sampled time into a release claim or tighten a
CI ceiling without repeated measurements on controlled hardware.

## CLI File I/O Benchmark

`pnpm run benchmark:cli-io` runs the compiled CLI in a fresh temporary repository for each sample
at the same 1,000- and 10,000-record sizes. It measures two real command boundaries:

- `rebuild` includes Node subprocess startup, ledger file reading, validation and rendering, and
  writing all four repository outputs.
- `import-draft` includes Node subprocess startup, ledger and draft reading, file-lock ownership,
  appending one approved record, and atomically committing all four repository outputs.

Fixture creation, post-command file reads, and output verification are outside the timed interval.
After every sample, the benchmark compares all output bytes with the in-memory renderer contract
and rejects leftover `.lock` or `.clarissimi-tmp` files. The one-sample CI check uses generous total
runaway ceilings of 30,000 ms for 1,000 records and 180,000 ms for 10,000 records. These values
catch stuck subprocesses or catastrophic file-I/O regressions; they are not filesystem SLAs.

`pnpm run benchmark:cli-io:sample` runs three samples per command for local investigation. Results
remain specific to the operating system, filesystem, storage device, antivirus state, machine
load, and Node runtime that produced them.

Hot paths:

- `clarissimi recognize`
- `clarissimi stage-draft`
- `clarissimi approve-draft`
- `clarissimi import-draft`
- `clarissimi rebuild`
- GitHub Action `dry-run`, `propose`, `stage-draft`, and `promote-draft`

## Required Evidence

- Source of truth: `docs/product/02-spec.md`, `docs/architecture/02-runtime-flow.md`,
  `docs/adr/0022-keep-ledger-single-file-with-partition-path.md`,
  `docs/adr/0052-bound-provider-input-evidence.md`
- Owner: Repository maintainers
- Merge-blocking validation: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,
  `pnpm run smoke`, `pnpm run check`, `pnpm run contract`
- Related checklist: `.agents/checklists/performance.md`

## Review Blockers

- A change sends unbounded raw evidence to providers.
- A change makes correctness tests depend on live provider or GitHub latency.
- A change adds repeated repository writes or default-branch mutation in write-mode paths.
- A change introduces partitioning, caching, or background work without a migration and invalidation
  story.
- A change removes the 1,000- and 10,000-record integrity checks or treats environment-specific
  timings as universal performance claims.
- A change leaves rebuild or import temporary files behind, or reports CLI timing without proving
  the written files still match the renderer contract.
