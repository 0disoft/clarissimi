import assert from "node:assert/strict";
import test from "node:test";

import {
  SCALE_BENCHMARK_CONTRACT,
  createScaleBenchmarkCorpus,
  parseScaleBenchmarkArgs,
  runScaleBenchmark,
  runScaleBenchmarkCli,
  validateScaleBenchmarkReport,
} from "../benchmark-scale.mjs";

test("scale benchmark corpus is deterministic and preserves contributor diversity", () => {
  const first = createScaleBenchmarkCorpus(25);
  const second = createScaleBenchmarkCorpus(25);

  assert.deepEqual(first, second);
  assert.equal(first.recordCount, 25);
  assert.equal(first.contributorCount, 3);
  assert.equal(first.records.length, 25);
  assert.equal(first.redactionInput.length, 25);
  assert.deepEqual(
    new Set(first.records.map((record) => record.contributor.kind)),
    new Set(["human"]),
  );

  const diverse = createScaleBenchmarkCorpus(100);
  assert.deepEqual(
    new Set(diverse.records.map((record) => record.contributor.kind)),
    new Set(["human", "bot", "ai_agent"]),
  );
});

test("scale benchmark validates rebuild, redaction, and Markdown output integrity", () => {
  const report = runScaleBenchmark({
    recordCounts: [20],
    sampleCount: 2,
    runawayCeilingMs: { 20: 60_000 },
  });

  assert.deepEqual(validateScaleBenchmarkReport(report, { enforceRunawayCeiling: true }), []);
  assert.equal(report.results[0].workloads.ledgerRebuild.value.parsedRecordCount, 20);
  assert.equal(report.results[0].workloads.redaction.value.occurrenceCount, 20);
  assert.equal(report.results[0].workloads.markdownRender.value.contributorCount, 2);
});

test("scale benchmark fails closed when a workload exceeds the runaway ceiling", () => {
  const report = runScaleBenchmark({
    recordCounts: [10],
    sampleCount: 1,
    runawayCeilingMs: { 10: 1 },
    now: (() => {
      let current = 0;
      return () => {
        current += 10;
        return current;
      };
    })(),
  });

  assert.deepEqual(validateScaleBenchmarkReport(report, { enforceRunawayCeiling: true }), [
    "results[10] exceeded the 1 ms runaway ceiling with 30 ms.",
  ]);
});

test("scale benchmark arguments separate check and sampled modes", () => {
  assert.deepEqual(parseScaleBenchmarkArgs(["--check"]), {
    ok: true,
    help: false,
    check: true,
    sampleCount: SCALE_BENCHMARK_CONTRACT.checkSampleCount,
  });
  assert.deepEqual(parseScaleBenchmarkArgs(["--samples", "5"]), {
    ok: true,
    help: false,
    check: false,
    sampleCount: 5,
  });
  assert.deepEqual(parseScaleBenchmarkArgs(["--samples", "0"]), {
    ok: false,
    message: "--samples must be an integer from 1 through 10.",
  });
});

test("scale benchmark CLI reports usage errors without running workloads", () => {
  let stdout = "";
  let stderr = "";
  const exitCode = runScaleBenchmarkCli(["--unknown"], {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout, "");
  assert.match(stderr, /Unknown option: --unknown/);
  assert.match(stderr, /Usage:/);
});
