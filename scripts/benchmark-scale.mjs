import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { redactJson } from "../packages/redaction/dist/index.js";
import {
  assertUniqueContributionRecords,
  parseContributionsJsonl,
  renderContributionsJsonl,
  renderContributorsMarkdown,
  renderRecognitionOutputs,
} from "../packages/renderers/dist/index.js";

const REPORT_SCHEMA_VERSION = "clarissimi.scale-benchmark/v1";
const CONTRIBUTIONS_PER_CONTRIBUTOR = 10;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const SCALE_BENCHMARK_CONTRACT = Object.freeze({
  recordCounts: Object.freeze([1_000, 10_000]),
  defaultSampleCount: 3,
  checkSampleCount: 1,
  runawayCeilingMs: Object.freeze({
    1_000: 15_000,
    10_000: 90_000,
  }),
});

export function createScaleBenchmarkCorpus(recordCount) {
  assertPositiveInteger(recordCount, "recordCount");
  const contributorCount = Math.max(1, Math.ceil(recordCount / CONTRIBUTIONS_PER_CONTRIBUTOR));
  const records = [];
  const redactionInput = [];

  for (let index = 0; index < recordCount; index += 1) {
    const contributorIndex = index % contributorCount;
    const contributorSuffix = String(contributorIndex + 1).padStart(5, "0");
    const pullRequestNumber = index + 1;
    const login = `scale-user-${contributorSuffix}`;

    records.push({
      schemaVersion: "clarissimi.assessment/v1",
      contributor: {
        platform: "github",
        id: String(100_000 + contributorIndex),
        login,
        profileUrl: `https://github.com/${login}`,
        kind: contributorKind(contributorIndex),
      },
      contributionType: contributionType(index),
      affectedArea: `scale-area-${index % 20}`,
      impactLevel: impactLevel(index),
      evidenceSummary: `Changed the deterministic scale fixture for pull request ${pullRequestNumber}.`,
      evidenceRefs: [
        {
          kind: "pull_request",
          id: String(pullRequestNumber),
          url: `https://github.com/0disoft/clarissimi/pull/${pullRequestNumber}`,
          title: `Scale fixture pull request ${pullRequestNumber}`,
        },
      ],
      suggestedBadge: "Scale fixture",
      publicRecognitionText: `Contributed deterministic scale fixture change ${pullRequestNumber}`,
      confidence: 0.9,
      maintainerApprovalStatus: "approved",
      source: {
        repository: "0disoft/clarissimi",
        event: "merged_pull_request",
        pullRequestNumber,
        mergedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    redactionInput.push({
      pullRequestNumber,
      author: `${login}@example.invalid`,
      summary: `Synthetic scale fixture ${pullRequestNumber} contains one public test address.`,
    });
  }

  return {
    recordCount,
    contributorCount,
    records,
    redactionInput,
  };
}

export function runScaleBenchmark(options = {}) {
  const recordCounts = options.recordCounts ?? SCALE_BENCHMARK_CONTRACT.recordCounts;
  const sampleCount = options.sampleCount ?? SCALE_BENCHMARK_CONTRACT.defaultSampleCount;
  const now = options.now ?? (() => performance.now());
  assertRecordCounts(recordCounts);
  assertPositiveInteger(sampleCount, "sampleCount");

  const results = recordCounts.map((recordCount) => {
    const corpus = createScaleBenchmarkCorpus(recordCount);
    const ledgerInput = renderContributionsJsonl(corpus.records);

    const ledgerRebuild = measureSamples(sampleCount, now, () => {
      const records = parseContributionsJsonl(ledgerInput);
      assertUniqueContributionRecords(records);
      const outputs = renderRecognitionOutputs(records, {
        summary: "table",
        includeAutomationContributors: true,
      });
      const contributors = JSON.parse(outputs.contributorsJson).contributors;
      const staticContributions = JSON.parse(outputs.staticDataJson).contributions;

      return {
        parsedRecordCount: records.length,
        contributorCount: contributors.length,
        staticRecordCount: staticContributions.length,
        outputBytes: sumUtf8Bytes(Object.values(outputs)),
        outputSha256: sha256(Object.values(outputs).join("\0")),
      };
    });

    const redaction = measureSamples(sampleCount, now, () => {
      const output = redactJson(corpus.redactionInput);
      const serialized = JSON.stringify(output.value);
      return {
        occurrenceCount: output.report.occurrences.length,
        outputBytes: Buffer.byteLength(serialized, "utf8"),
        outputSha256: sha256(serialized),
      };
    });

    const markdownRender = measureSamples(sampleCount, now, () => {
      const markdown = renderContributorsMarkdown(corpus.records, {
        summary: "table",
        includeAutomationContributors: true,
      });
      return {
        contributorCount: corpus.contributorCount,
        outputBytes: Buffer.byteLength(markdown, "utf8"),
        outputSha256: sha256(markdown),
      };
    });

    const totalMedianMs = roundMilliseconds(
      ledgerRebuild.medianMs + redaction.medianMs + markdownRender.medianMs,
    );
    const totalMaxMs = roundMilliseconds(
      ledgerRebuild.maxMs + redaction.maxMs + markdownRender.maxMs,
    );
    const ceilingMs = ceilingForRecordCount(recordCount, options.runawayCeilingMs);

    return {
      recordCount,
      contributorCount: corpus.contributorCount,
      workloads: {
        ledgerRebuild,
        redaction,
        markdownRender,
      },
      totalMedianMs,
      totalMaxMs,
      runawayCeilingMs: ceilingMs,
      withinRunawayCeiling: totalMaxMs <= ceilingMs,
    };
  });

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    contract: {
      recordCounts: [...recordCounts],
      contributionsPerContributor: CONTRIBUTIONS_PER_CONTRIBUTOR,
      sampleCount,
      timingSemantics:
        "Local wall-clock samples are environment-specific; runaway ceilings are regression guards, not latency promises.",
    },
    results,
  };
}

export function validateScaleBenchmarkReport(report, options = {}) {
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
    return [...issues, "results must contain at least one workload result."];
  }

  for (const result of report.results) {
    const prefix = `results[${result?.recordCount ?? "unknown"}]`;
    if (!Number.isInteger(result?.recordCount) || result.recordCount <= 0) {
      issues.push(`${prefix}.recordCount must be a positive integer.`);
      continue;
    }

    const expectedContributorCount = Math.ceil(result.recordCount / CONTRIBUTIONS_PER_CONTRIBUTOR);
    if (result.contributorCount !== expectedContributorCount) {
      issues.push(`${prefix}.contributorCount must be ${expectedContributorCount}.`);
    }

    validateWorkloadTiming(
      result.workloads?.ledgerRebuild,
      sampleCount,
      `${prefix}.ledgerRebuild`,
      issues,
    );
    validateWorkloadTiming(result.workloads?.redaction, sampleCount, `${prefix}.redaction`, issues);
    validateWorkloadTiming(
      result.workloads?.markdownRender,
      sampleCount,
      `${prefix}.markdownRender`,
      issues,
    );

    const ledgerValue = result.workloads?.ledgerRebuild?.value;
    if (ledgerValue?.parsedRecordCount !== result.recordCount) {
      issues.push(`${prefix}.ledgerRebuild parsedRecordCount must equal recordCount.`);
    }
    if (ledgerValue?.staticRecordCount !== result.recordCount) {
      issues.push(`${prefix}.ledgerRebuild staticRecordCount must equal recordCount.`);
    }
    if (ledgerValue?.contributorCount !== expectedContributorCount) {
      issues.push(`${prefix}.ledgerRebuild contributorCount must be ${expectedContributorCount}.`);
    }

    const redactionValue = result.workloads?.redaction?.value;
    if (redactionValue?.occurrenceCount !== result.recordCount) {
      issues.push(`${prefix}.redaction occurrenceCount must equal recordCount.`);
    }

    const markdownValue = result.workloads?.markdownRender?.value;
    if (markdownValue?.contributorCount !== expectedContributorCount) {
      issues.push(`${prefix}.markdownRender contributorCount must be ${expectedContributorCount}.`);
    }

    for (const [name, workload] of Object.entries(result.workloads ?? {})) {
      if (!Number.isInteger(workload?.value?.outputBytes) || workload.value.outputBytes <= 0) {
        issues.push(`${prefix}.${name} outputBytes must be a positive integer.`);
      }
      if (!SHA256_PATTERN.test(workload?.value?.outputSha256 ?? "")) {
        issues.push(`${prefix}.${name} outputSha256 must be a lowercase SHA-256 digest.`);
      }
    }

    if (enforceRunawayCeiling && result.withinRunawayCeiling !== true) {
      issues.push(
        `${prefix} exceeded the ${result.runawayCeilingMs} ms runaway ceiling with ${result.totalMaxMs} ms.`,
      );
    }
  }

  return issues;
}

export function parseScaleBenchmarkArgs(args) {
  let check = false;
  let sampleCount;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--samples") {
      const rawValue = args[index + 1];
      const parsed = Number(rawValue);
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
        ? SCALE_BENCHMARK_CONTRACT.checkSampleCount
        : SCALE_BENCHMARK_CONTRACT.defaultSampleCount),
  };
}

export function runScaleBenchmarkCli(args, io = {}) {
  const stdout = io.stdout ?? ((value) => process.stdout.write(value));
  const stderr = io.stderr ?? ((value) => process.stderr.write(value));
  const parsed = parseScaleBenchmarkArgs(args);

  if (!parsed.ok) {
    stderr(`${parsed.message}\n`);
    stderr(`${usageText()}\n`);
    return 2;
  }
  if (parsed.help) {
    stdout(`${usageText()}\n`);
    return 0;
  }

  const report = runScaleBenchmark({ sampleCount: parsed.sampleCount });
  const issues = validateScaleBenchmarkReport(report, {
    enforceRunawayCeiling: parsed.check,
  });
  stdout(`${JSON.stringify({ ...report, ok: issues.length === 0, issues }, null, 2)}\n`);
  return issues.length === 0 ? 0 : 1;
}

function measureSamples(sampleCount, now, operation) {
  const samplesMs = [];
  let value;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const startedAt = now();
    value = operation();
    const finishedAt = now();
    samplesMs.push(roundMilliseconds(finishedAt - startedAt));
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

function validateWorkloadTiming(workload, sampleCount, path, issues) {
  if (!Array.isArray(workload?.samplesMs) || workload.samplesMs.length !== sampleCount) {
    issues.push(`${path} samplesMs must contain ${sampleCount} samples.`);
    return;
  }

  for (const timing of workload.samplesMs) {
    if (!Number.isFinite(timing) || timing < 0) {
      issues.push(`${path} samplesMs must contain finite non-negative numbers.`);
      break;
    }
  }

  if (!Number.isFinite(workload.medianMs) || workload.medianMs < 0) {
    issues.push(`${path} medianMs must be a finite non-negative number.`);
  }
  if (!Number.isFinite(workload.maxMs) || workload.maxMs < 0) {
    issues.push(`${path} maxMs must be a finite non-negative number.`);
  }
}

function contributorKind(index) {
  if (index % 10 === 8) {
    return "bot";
  }
  if (index % 10 === 9) {
    return "ai_agent";
  }
  return "human";
}

function contributionType(index) {
  return ["bug_fix", "test", "performance", "documentation", "maintenance"][index % 5];
}

function impactLevel(index) {
  return ["low", "medium", "high"][index % 3];
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
  const ceiling =
    overrides?.[recordCount] ?? SCALE_BENCHMARK_CONTRACT.runawayCeilingMs[recordCount];
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    throw new TypeError(`No positive runaway ceiling is configured for ${recordCount} records.`);
  }
  return ceiling;
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

function usageText() {
  return [
    "Usage: node scripts/benchmark-scale.mjs [--check] [--samples <1-10>]",
    "",
    "--check  Enforce generous runaway ceilings; defaults to one sample per workload.",
    "Without --check, emit three environment-specific wall-clock samples by default.",
  ].join("\n");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = runScaleBenchmarkCli(process.argv.slice(2));
}
