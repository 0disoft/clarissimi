import assert from "node:assert/strict";
import test from "node:test";

import {
  CLI_IO_BENCHMARK_CONTRACT,
  parseCliIoBenchmarkArgs,
  runCliIoBenchmark,
  runCliIoBenchmarkCli,
  validateCliIoBenchmarkReport,
} from "../benchmark-cli-io.mjs";

test("CLI I/O benchmark runs real rebuild and atomic import paths", async () => {
  const report = await runCliIoBenchmark({
    recordCounts: [10],
    sampleCount: 1,
    runawayCeilingMs: { 10: 60_000 },
  });

  assert.deepEqual(validateCliIoBenchmarkReport(report, { enforceRunawayCeiling: true }), []);
  assert.equal(report.results[0].workloads.rebuild.value.recordCount, 10);
  assert.equal(report.results[0].workloads.importDraft.value.recordCount, 11);
  assert.equal(report.results[0].workloads.rebuild.value.residueCount, 0);
  assert.equal(report.results[0].workloads.importDraft.value.residueCount, 0);
});

test("CLI I/O benchmark fails closed when output integrity is missing", async () => {
  const report = await runCliIoBenchmark({
    recordCounts: [10],
    sampleCount: 1,
    runawayCeilingMs: { 10: 60_000 },
  });
  report.results[0].workloads.importDraft.value.outputSha256 = "invalid";
  report.results[0].workloads.rebuild.value.residueCount = 1;

  assert.deepEqual(validateCliIoBenchmarkReport(report), [
    "results[10].rebuild residueCount must be 0.",
    "results[10].importDraft outputSha256 must be a lowercase SHA-256 digest.",
  ]);
});

test("CLI I/O benchmark arguments separate check and sampled modes", () => {
  assert.deepEqual(parseCliIoBenchmarkArgs(["--check"]), {
    ok: true,
    help: false,
    check: true,
    sampleCount: CLI_IO_BENCHMARK_CONTRACT.checkSampleCount,
  });
  assert.deepEqual(parseCliIoBenchmarkArgs(["--samples", "4"]), {
    ok: true,
    help: false,
    check: false,
    sampleCount: 4,
  });
  assert.deepEqual(parseCliIoBenchmarkArgs(["--samples", "11"]), {
    ok: false,
    message: "--samples must be an integer from 1 through 10.",
  });
});

test("CLI I/O benchmark CLI rejects unknown options before filesystem work", async () => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCliIoBenchmarkCli(["--unknown"], {
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
