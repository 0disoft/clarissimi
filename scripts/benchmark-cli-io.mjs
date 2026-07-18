import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  RENDERED_OUTPUT_PATHS,
  renderContributionsJsonl,
  renderRecognitionOutputs,
} from "../packages/renderers/dist/index.js";
import { createScaleBenchmarkCorpus } from "./benchmark-scale.mjs";

const REPORT_SCHEMA_VERSION = "clarissimi.cli-io-benchmark/v1";
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024;
const CHILD_TIMEOUT_MS = 120_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = resolve(repoRoot, "packages/cli/dist/bin/clarissimi.js");
const orderedOutputPaths = Object.values(RENDERED_OUTPUT_PATHS);

export const CLI_IO_BENCHMARK_CONTRACT = Object.freeze({
  recordCounts: Object.freeze([1_000, 10_000]),
  defaultSampleCount: 3,
  checkSampleCount: 1,
  runawayCeilingMs: Object.freeze({
    1_000: 30_000,
    10_000: 180_000,
  }),
});

export async function runCliIoBenchmark(options = {}) {
  const recordCounts = options.recordCounts ?? CLI_IO_BENCHMARK_CONTRACT.recordCounts;
  const sampleCount = options.sampleCount ?? CLI_IO_BENCHMARK_CONTRACT.defaultSampleCount;
  const now = options.now ?? (() => performance.now());
  const createTempDirectory =
    options.createTempDirectory ??
    (() => mkdtemp(join(options.tempRoot ?? tmpdir(), "clarissimi-cli-io-benchmark-")));
  const runCommand = options.runCommand ?? runCliCommand;
  assertRecordCounts(recordCounts);
  assertPositiveInteger(sampleCount, "sampleCount");

  const results = [];
  for (const recordCount of recordCounts) {
    const corpus = createScaleBenchmarkCorpus(recordCount);
    const ledger = renderContributionsJsonl(corpus.records);
    const nextRecord = createNextRecord(corpus.records[0], recordCount + 1);
    const rebuildExpected = renderRecognitionOutputs(corpus.records, { summary: "table" });
    const importExpected = renderRecognitionOutputs([...corpus.records, nextRecord], {
      summary: "table",
    });

    const rebuild = await measureAsyncSamples(sampleCount, async () => {
      return runFilesystemSample({
        createTempDirectory,
        runCommand,
        now,
        recordCount,
        ledger,
        expectedOutputs: rebuildExpected,
        command: "rebuild",
      });
    });
    const importDraft = await measureAsyncSamples(sampleCount, async () => {
      return runFilesystemSample({
        createTempDirectory,
        runCommand,
        now,
        recordCount,
        ledger,
        nextRecord,
        expectedOutputs: importExpected,
        command: "import-draft",
      });
    });
    const totalMedianMs = roundMilliseconds(rebuild.medianMs + importDraft.medianMs);
    const totalMaxMs = roundMilliseconds(rebuild.maxMs + importDraft.maxMs);
    const runawayCeilingMs = ceilingForRecordCount(recordCount, options.runawayCeilingMs);

    results.push({
      recordCount,
      workloads: { rebuild, importDraft },
      totalMedianMs,
      totalMaxMs,
      runawayCeilingMs,
      withinRunawayCeiling: totalMaxMs <= runawayCeilingMs,
    });
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    contract: {
      recordCounts: [...recordCounts],
      sampleCount,
      workloads: ["rebuild", "import-draft"],
      timingSemantics:
        "Local wall-clock samples include Node subprocess startup and command file I/O; verification and fixture setup are excluded.",
    },
    results,
  };
}

export function validateCliIoBenchmarkReport(report, options = {}) {
  const issues = [];
  const enforceRunawayCeiling = options.enforceRunawayCeiling ?? false;

  if (report?.schemaVersion !== REPORT_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${REPORT_SCHEMA_VERSION}.`);
  }

  const sampleCount = report?.contract?.sampleCount;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    issues.push("contract.sampleCount must be a positive integer.");
  }
  if (!Array.isArray(report?.results) || report.results.length === 0) {
    return [...issues, "results must contain at least one CLI I/O workload result."];
  }

  for (const result of report.results) {
    const prefix = `results[${result?.recordCount ?? "unknown"}]`;
    if (!Number.isInteger(result?.recordCount) || result.recordCount <= 0) {
      issues.push(`${prefix}.recordCount must be a positive integer.`);
      continue;
    }

    validateWorkload(
      result.workloads?.rebuild,
      sampleCount,
      result.recordCount,
      `${prefix}.rebuild`,
      issues,
    );
    validateWorkload(
      result.workloads?.importDraft,
      sampleCount,
      result.recordCount + 1,
      `${prefix}.importDraft`,
      issues,
    );

    if (enforceRunawayCeiling && result.withinRunawayCeiling !== true) {
      issues.push(
        `${prefix} exceeded the ${result.runawayCeilingMs} ms runaway ceiling with ${result.totalMaxMs} ms.`,
      );
    }
  }

  return issues;
}

export function parseCliIoBenchmarkArgs(args) {
  let check = false;
  let sampleCount;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--samples") {
      const parsed = Number(args[index + 1]);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 10) {
        return { ok: false, message: "--samples must be an integer from 1 through 10." };
      }
      sampleCount = parsed;
      index += 1;
      continue;
    }
    if (arg === "--help") {
      return { ok: true, help: true };
    }
    return { ok: false, message: `Unknown option: ${arg}` };
  }

  return {
    ok: true,
    help: false,
    check,
    sampleCount:
      sampleCount ??
      (check
        ? CLI_IO_BENCHMARK_CONTRACT.checkSampleCount
        : CLI_IO_BENCHMARK_CONTRACT.defaultSampleCount),
  };
}

export async function runCliIoBenchmarkCli(args, io = {}) {
  const stdout = io.stdout ?? ((value) => process.stdout.write(value));
  const stderr = io.stderr ?? ((value) => process.stderr.write(value));
  const parsed = parseCliIoBenchmarkArgs(args);

  if (!parsed.ok) {
    stderr(`${parsed.message}\n${usageText()}\n`);
    return 2;
  }
  if (parsed.help) {
    stdout(`${usageText()}\n`);
    return 0;
  }

  try {
    const report = await runCliIoBenchmark({ sampleCount: parsed.sampleCount });
    const issues = validateCliIoBenchmarkReport(report, {
      enforceRunawayCeiling: parsed.check,
    });
    stdout(`${JSON.stringify({ ...report, ok: issues.length === 0, issues }, null, 2)}\n`);
    return issues.length === 0 ? 0 : 1;
  } catch (error) {
    stderr(`CLI I/O benchmark failed: ${safeErrorMessage(error)}\n`);
    return 1;
  }
}

async function runFilesystemSample(options) {
  const directory = await options.createTempDirectory();
  const ledgerPath = join(directory, RENDERED_OUTPUT_PATHS.contributionsJsonl);
  const draftPath = join(directory, "approved-draft.json");

  try {
    await mkdir(dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, options.ledger, "utf8");
    if (options.nextRecord !== undefined) {
      await writeFile(draftPath, `${JSON.stringify(options.nextRecord, null, 2)}\n`, "utf8");
    }

    const args =
      options.command === "rebuild"
        ? [
            "rebuild",
            "--ledger",
            ledgerPath,
            "--out-dir",
            directory,
            "--markdown-summary",
            "table",
            "--json",
          ]
        : [
            "import-draft",
            "--draft",
            draftPath,
            "--ledger",
            ledgerPath,
            "--out-dir",
            directory,
            "--markdown-summary",
            "table",
            "--json",
          ];
    const startedAt = options.now();
    const commandResult = await options.runCommand(args, directory);
    const elapsedMs = roundMilliseconds(options.now() - startedAt);
    const summary = parseCommandSummary(commandResult.stdout, options.command);
    const outputSummary = await verifyOutputFiles(directory, options.expectedOutputs);
    const residue = await findCommandResidue(directory);
    if (residue.length > 0) {
      throw new Error(`${options.command} left temporary or lock files: ${residue.join(", ")}`);
    }

    const expectedRecordCount =
      options.command === "import-draft" ? options.recordCount + 1 : options.recordCount;
    if (summary.records !== expectedRecordCount) {
      throw new Error(
        `${options.command} reported ${summary.records} records; expected ${expectedRecordCount}.`,
      );
    }

    return {
      elapsedMs,
      value: {
        recordCount: expectedRecordCount,
        outputFileCount: orderedOutputPaths.length,
        outputBytes: outputSummary.outputBytes,
        outputSha256: outputSummary.outputSha256,
        residueCount: residue.length,
      },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyOutputFiles(directory, expectedOutputs) {
  const expectedByPath = new Map([
    [RENDERED_OUTPUT_PATHS.contributionsJsonl, expectedOutputs.contributionsJsonl],
    [RENDERED_OUTPUT_PATHS.contributorsJson, expectedOutputs.contributorsJson],
    [RENDERED_OUTPUT_PATHS.contributorsMarkdown, expectedOutputs.contributorsMarkdown],
    [RENDERED_OUTPUT_PATHS.staticDataJson, expectedOutputs.staticDataJson],
  ]);
  const contents = [];

  for (const path of orderedOutputPaths) {
    const actual = await readFile(join(directory, path), "utf8");
    const expected = expectedByPath.get(path);
    if (actual !== expected) {
      throw new Error(`CLI output does not match the in-memory renderer contract: ${path}.`);
    }
    contents.push(actual);
  }

  return {
    outputBytes: sumUtf8Bytes(contents),
    outputSha256: sha256(contents.join("\0")),
  };
}

async function findCommandResidue(directory) {
  const residue = [];
  await walk(directory, async (path, name) => {
    if (name.endsWith(".lock") || name.endsWith(".clarissimi-tmp")) {
      residue.push(path.slice(directory.length + 1).replaceAll("\\", "/"));
    }
  });
  return residue.sort();
}

async function walk(directory, visit) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path, visit);
    } else {
      await visit(path, entry.name);
    }
  }
}

async function measureAsyncSamples(sampleCount, operation) {
  const samplesMs = [];
  let value;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const result = await operation();
    value = result.value;
    samplesMs.push(result.elapsedMs);
  }

  const ordered = [...samplesMs].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median =
    ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
  return {
    samplesMs,
    medianMs: roundMilliseconds(median),
    maxMs: ordered.at(-1),
    value,
  };
}

function runCliCommand(args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: { NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let forcedFailure;
    const timer = setTimeout(() => {
      failAndKill(new Error(`CLI command timed out after ${CHILD_TIMEOUT_MS} ms.`));
    }, CHILD_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      enforceOutputLimit();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      enforceOutputLimit();
    });
    child.on("error", finish);
    child.on("close", (code, signal) => {
      if (forcedFailure !== undefined) {
        finish(forcedFailure);
        return;
      }
      if (code !== 0) {
        finish(
          new Error(
            `CLI command failed with code ${String(code)} signal ${String(signal)}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      finish(undefined, { stdout, stderr });
    });

    function enforceOutputLimit() {
      if (
        Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8") >
        MAX_CHILD_OUTPUT_BYTES
      ) {
        failAndKill(new Error(`CLI command output exceeded ${MAX_CHILD_OUTPUT_BYTES} bytes.`));
      }
    }

    function failAndKill(error) {
      if (forcedFailure !== undefined || settled) {
        return;
      }
      forcedFailure = error;
      child.kill();
    }

    function finish(error, value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) {
        rejectPromise(error);
      } else {
        resolvePromise(value);
      }
    }
  });
}

function parseCommandSummary(stdout, command) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error(`${command} did not emit one JSON summary.`);
  }
  if (value?.ok !== true || value.command !== command || !Number.isInteger(value.records)) {
    throw new Error(`${command} emitted an invalid JSON summary.`);
  }
  return value;
}

function createNextRecord(template, pullRequestNumber) {
  if (template === undefined) {
    throw new Error("CLI I/O benchmark requires at least one template record.");
  }
  return {
    ...template,
    evidenceSummary: `Changed the deterministic CLI I/O fixture for pull request ${pullRequestNumber}.`,
    evidenceRefs: [
      {
        kind: "pull_request",
        id: String(pullRequestNumber),
        url: `https://github.com/0disoft/clarissimi/pull/${pullRequestNumber}`,
        title: `CLI I/O fixture pull request ${pullRequestNumber}`,
      },
    ],
    publicRecognitionText: `Contributed deterministic CLI I/O fixture change ${pullRequestNumber}`,
    source: {
      ...template.source,
      pullRequestNumber,
    },
  };
}

function validateWorkload(workload, sampleCount, expectedRecordCount, path, issues) {
  if (!Array.isArray(workload?.samplesMs) || workload.samplesMs.length !== sampleCount) {
    issues.push(`${path} samplesMs must contain ${sampleCount} samples.`);
    return;
  }
  if (workload.samplesMs.some((value) => !Number.isFinite(value) || value < 0)) {
    issues.push(`${path} samplesMs must contain finite non-negative numbers.`);
  }
  if (!Number.isFinite(workload.medianMs) || workload.medianMs < 0) {
    issues.push(`${path} medianMs must be a finite non-negative number.`);
  }
  if (!Number.isFinite(workload.maxMs) || workload.maxMs < 0) {
    issues.push(`${path} maxMs must be a finite non-negative number.`);
  }
  if (workload.value?.recordCount !== expectedRecordCount) {
    issues.push(`${path} recordCount must be ${expectedRecordCount}.`);
  }
  if (workload.value?.outputFileCount !== orderedOutputPaths.length) {
    issues.push(`${path} outputFileCount must be ${orderedOutputPaths.length}.`);
  }
  if (!Number.isInteger(workload.value?.outputBytes) || workload.value.outputBytes <= 0) {
    issues.push(`${path} outputBytes must be a positive integer.`);
  }
  if (!SHA256_PATTERN.test(workload.value?.outputSha256 ?? "")) {
    issues.push(`${path} outputSha256 must be a lowercase SHA-256 digest.`);
  }
  if (workload.value?.residueCount !== 0) {
    issues.push(`${path} residueCount must be 0.`);
  }
}

function assertRecordCounts(recordCounts) {
  if (!Array.isArray(recordCounts) || recordCounts.length === 0) {
    throw new TypeError("recordCounts must contain at least one size.");
  }
  recordCounts.forEach((recordCount) => assertPositiveInteger(recordCount, "recordCounts[]"));
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function ceilingForRecordCount(recordCount, overrides) {
  const value = overrides?.[recordCount] ?? CLI_IO_BENCHMARK_CONTRACT.runawayCeilingMs[recordCount];
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`No positive CLI I/O runaway ceiling is configured for ${recordCount}.`);
  }
  return value;
}

function sumUtf8Bytes(values) {
  return values.reduce((total, value) => total + Buffer.byteLength(value, "utf8"), 0);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function roundMilliseconds(value) {
  return Number(value.toFixed(3));
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function usageText() {
  return [
    "Usage: node scripts/benchmark-cli-io.mjs [--check] [--samples <1-10>]",
    "",
    "--check  Enforce generous runaway ceilings with one sample per workload by default.",
    "Without --check, run three environment-specific samples per workload by default.",
  ].join("\n");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await runCliIoBenchmarkCli(process.argv.slice(2));
}
