import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  isAuthorizedActionMajorAlias,
  parseAuthorizedActionReleaseVersion,
} from "./action-release-version.mjs";

const defaults = {
  repo: "0disoft/clarissimi",
  branch: "main",
  externalRepo: "0disoft/integration-lab",
  releaseType: "source-only",
};

const usageText = [
  "Usage:",
  "  pnpm run release-candidate-evidence-orchestrator -- --provider-model <model> [--sha <commit-sha>] [--external-ref <tag-or-sha|v0|v1>] [--release-type <source-only|versioned-action-tag|marketplace-action-tag|major-alias>] [--release-version <v0.x.y|v1.x.y>] [--create-issue]",
  "",
  "The default is an issue preview. Hosted workflows still run, including the full-write smoke and orphan audit.",
  "Use --create-issue only after reviewing the generated evidence body.",
].join("\n");

export async function runReleaseCandidateEvidenceOrchestrator(argv, runtime = defaultRuntime()) {
  try {
    return await run(argv, runtime);
  } catch (error) {
    if (error instanceof UsageError) return error.exitCode;
    runtime.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function run(argv, runtime) {
  const args = parseArgs(argv, runtime);
  if (args.help) {
    runtime.log(usageText);
    return 0;
  }
  validateArgs(args, runtime);

  const repo = args.repo ?? defaults.repo;
  const branch = args.branch ?? defaults.branch;
  const externalRepo = args.externalRepo ?? defaults.externalRepo;
  const releaseType = args.releaseType ?? defaults.releaseType;
  const sha =
    args.sha ?? (await commandText(runtime, "git", ["rev-parse", "HEAD"], "resolve current HEAD"));
  const externalRef = args.externalRef ?? sha;
  const liveRef = releaseType === "major-alias" ? args.releaseVersion : branch;
  const evidenceId = runtime.randomEvidenceId();

  if (!isRepo(repo) || !isRepo(externalRepo))
    return usageFailure(runtime, "--repo and --external-repo must use owner/name format.");
  if (!isSha(sha)) return usageFailure(runtime, "--sha must be a 40-character commit SHA.");
  if (releaseType === "source-only" && externalRef.toLowerCase() !== sha.toLowerCase()) {
    return usageFailure(runtime, "source-only evidence requires --external-ref to equal --sha.");
  }
  if (!isEvidenceId(evidenceId))
    throw new Error("Runtime generated an invalid evidence correlation id.");

  await command(runtime, "gh", ["--version"], "find GitHub CLI");
  await preflight(runtime, { repo, branch, liveRef, externalRepo, externalRef, sha });
  await requireSecret(runtime, repo, "CLARISSIMI_PROVIDER_TOKEN");

  const ciRun = await findRun(runtime, {
    repo,
    workflow: "CI",
    branch,
    headSha: sha,
  });
  await watchIfNeeded(runtime, repo, ciRun, "hosted CI");

  const liveRun = await dispatchAndWatch(runtime, {
    repo,
    workflow: "clarissimi-live-provider-smoke.yml",
    ref: liveRef,
    fields: [
      "provider-model",
      args.providerModel,
      "provider-endpoint",
      args.providerEndpoint,
      "provider-thinking",
      args.providerThinking,
      "evidence-id",
      evidenceId,
    ],
    expectedTitle: `Clarissimi live provider smoke · ${evidenceId}`,
    label: "hosted live-provider smoke",
  });

  const externalRun = await dispatchAndWatch(runtime, {
    repo: externalRepo,
    workflow: "clarissimi.yml",
    ref: "main",
    fields: [
      "clarissimi-ref",
      externalRef,
      "expected-sha",
      isAuthorizedActionMajorAlias(externalRef) ? sha : undefined,
      "evidence-id",
      evidenceId,
    ],
    expectedTitle: `Clarissimi external consumer · ${externalRef} · ${evidenceId}`,
    label: "external dry-run smoke",
  });

  let fullWriteRun;
  let primaryError;
  let auditRun;
  try {
    fullWriteRun = await dispatchAndWatch(runtime, {
      repo: externalRepo,
      workflow: "clarissimi-full-write-smoke.yml",
      ref: "main",
      fields: [
        "clarissimi-ref",
        externalRef,
        "expected-sha",
        isAuthorizedActionMajorAlias(externalRef) ? sha : undefined,
        "evidence-id",
        evidenceId,
      ],
      expectedTitle: (run) =>
        `Clarissimi full write smoke · ${externalRef} · ${evidenceId} · ${run.databaseId}`,
      label: "external full-write smoke",
      skipOrphanAuditOnRunnerAdmissionFailure: true,
    });
  } catch (error) {
    primaryError = error;
  } finally {
    if (primaryError instanceof RunnerAdmissionError && primaryError.skipOrphanAudit) {
      runtime.log(
        "external orphan audit was not dispatched because GitHub assigned no runner and ran no full-write steps.",
      );
    } else {
      try {
        auditRun = await dispatchAndWatch(runtime, {
          repo: externalRepo,
          workflow: "clarissimi-orphan-audit.yml",
          ref: "main",
          fields: ["evidence-id", evidenceId],
          expectedTitle: `Clarissimi smoke orphan audit · ${evidenceId}`,
          label: "external orphan audit",
        });
      } catch (error) {
        if (primaryError === undefined) primaryError = error;
        else runtime.error(`orphan audit also failed: ${error.message}`);
      }
    }
  }
  if (primaryError !== undefined) throw primaryError;

  const evidenceArgs = [
    "run",
    "release-candidate-evidence-issue",
    "--",
    "--release-type",
    releaseType,
    "--sha",
    sha,
    "--ci-run",
    String(ciRun.databaseId),
    "--live-run",
    String(liveRun.databaseId),
    "--external-run",
    String(externalRun.databaseId),
    "--external-write-run",
    String(fullWriteRun.databaseId),
    "--provider-model",
    args.providerModel,
  ];
  appendOption(evidenceArgs, "--evidence-id", evidenceId);
  appendOption(evidenceArgs, "--release-version", args.releaseVersion);
  appendOption(evidenceArgs, "--external-ref", externalRef);
  appendOption(evidenceArgs, "--live-ref", liveRef);
  appendOption(evidenceArgs, "--provider-endpoint", args.providerEndpoint);
  appendOption(evidenceArgs, "--provider-thinking", args.providerThinking);
  if (!args.createIssue) evidenceArgs.push("--print");
  await command(
    runtime,
    "pnpm",
    evidenceArgs,
    args.createIssue ? "create evidence issue" : "render evidence issue preview",
    { inherit: true },
  );

  runtime.log(
    JSON.stringify(
      {
        mode: args.createIssue ? "create-issue" : "preview",
        sha,
        externalRef,
        evidenceId,
        runs: {
          ci: ciRun.databaseId,
          liveProvider: liveRun.databaseId,
          externalDryRun: externalRun.databaseId,
          externalFullWrite: fullWriteRun.databaseId,
          orphanAudit: auditRun.databaseId,
        },
      },
      null,
      2,
    ),
  );
  return 0;
}

async function preflight(runtime, options) {
  const resolvedSha = await commandText(
    runtime,
    "gh",
    [
      "api",
      `repos/${options.repo}/commits/${encodeURIComponent(options.externalRef)}`,
      "--jq",
      ".sha",
    ],
    `resolve candidate ref ${options.externalRef}`,
  );
  if (resolvedSha.toLowerCase() !== options.sha.toLowerCase()) {
    throw new Error(
      `Candidate ref ${options.externalRef} resolves to ${resolvedSha}, expected ${options.sha}. ` +
        "No workflow was dispatched.",
    );
  }

  const workflows = [
    { repo: options.repo, ref: options.branch, workflow: "CI" },
    {
      repo: options.repo,
      ref: options.liveRef,
      workflow: "clarissimi-live-provider-smoke.yml",
    },
    { repo: options.externalRepo, ref: "main", workflow: "clarissimi.yml" },
    {
      repo: options.externalRepo,
      ref: "main",
      workflow: "clarissimi-full-write-smoke.yml",
    },
    {
      repo: options.externalRepo,
      ref: "main",
      workflow: "clarissimi-orphan-audit.yml",
    },
  ];
  for (const workflow of workflows) {
    await command(
      runtime,
      "gh",
      [
        "workflow",
        "view",
        workflow.workflow,
        "--repo",
        workflow.repo,
        "--ref",
        workflow.ref,
        "--yaml",
      ],
      `preflight ${workflow.repo} workflow ${workflow.workflow}`,
    );
  }
  runtime.log(
    `preflight passed for ${options.repo}@${options.externalRef} and ${options.externalRepo}`,
  );
}

function parseArgs(argv, runtime) {
  const parsed = {};
  const booleanOptions = new Map([["create-issue", "createIssue"]]);
  const valueOptions = new Map([
    ["repo", "repo"],
    ["branch", "branch"],
    ["external-repo", "externalRepo"],
    ["external-ref", "externalRef"],
    ["release-type", "releaseType"],
    ["release-version", "releaseVersion"],
    ["sha", "sha"],
    ["provider-model", "providerModel"],
    ["provider-endpoint", "providerEndpoint"],
    ["provider-thinking", "providerThinking"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--"))
      return usageFailure(runtime, `Unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    if (booleanOptions.has(key)) {
      parsed[booleanOptions.get(key)] = true;
      continue;
    }
    if (!valueOptions.has(key)) return usageFailure(runtime, `Unsupported option: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      return usageFailure(runtime, `${arg} requires a value.`);
    parsed[valueOptions.get(key)] = value;
    index += 1;
  }
  return parsed;
}

function validateArgs(args, runtime) {
  if (args.providerModel === undefined || args.providerModel.trim() === "")
    return usageFailure(runtime, "--provider-model is required.");
  const releaseType = args.releaseType ?? defaults.releaseType;
  if (
    !["source-only", "versioned-action-tag", "marketplace-action-tag", "major-alias"].includes(
      releaseType,
    )
  )
    return usageFailure(
      runtime,
      "--release-type must be source-only, versioned-action-tag, marketplace-action-tag, or major-alias.",
    );
  if (
    ["versioned-action-tag", "marketplace-action-tag", "major-alias"].includes(releaseType) &&
    parseAuthorizedActionReleaseVersion(args.releaseVersion) === undefined
  ) {
    return usageFailure(
      runtime,
      "versioned and Marketplace Action evidence requires --release-version <v0.x.y|v1.x.y>.",
    );
  }
  if (releaseType === "major-alias") {
    const expectedAlias = parseAuthorizedActionReleaseVersion(args.releaseVersion)?.alias;
    if (args.externalRef !== expectedAlias)
      return usageFailure(
        runtime,
        `major-alias evidence requires --external-ref ${expectedAlias}.`,
      );
  }
  if (args.providerEndpoint !== undefined && !isHttps(args.providerEndpoint))
    return usageFailure(runtime, "--provider-endpoint must be an https URL.");
  if (args.providerThinking !== undefined && args.providerThinking !== "disabled")
    return usageFailure(runtime, "--provider-thinking supports only disabled.");
}

async function requireSecret(runtime, repo, name) {
  const output = await commandText(
    runtime,
    "gh",
    ["secret", "list", "--repo", repo, "--app", "actions", "--json", "name"],
    "list repository secret names",
  );
  const secrets = parseJson(output, "gh secret list");
  if (!Array.isArray(secrets) || !secrets.some((secret) => secret.name === name))
    throw new Error(`Missing repository secret ${name} for ${repo}. No workflow was dispatched.`);
  runtime.log(`repository secret ${name} is configured for ${repo}`);
}

async function dispatchAndWatch(runtime, options) {
  const dispatchedAfter = runtime.now() - 30_000;
  const args = ["workflow", "run", options.workflow, "--repo", options.repo, "--ref", options.ref];
  for (let index = 0; index < options.fields.length; index += 2)
    appendOption(
      args,
      "-f",
      options.fields[index + 1] === undefined
        ? undefined
        : `${options.fields[index]}=${options.fields[index + 1]}`,
    );
  await command(runtime, "gh", args, `dispatch ${options.label}`);
  const run = await findRun(runtime, {
    repo: options.repo,
    workflow: options.workflow,
    branch: options.ref,
    createdAfter: dispatchedAfter,
    expectedTitle: options.expectedTitle,
  });
  await watchIfNeeded(runtime, options.repo, run, options.label, {
    skipOrphanAuditOnRunnerAdmissionFailure:
      options.skipOrphanAuditOnRunnerAdmissionFailure === true,
  });
  return run;
}

async function findRun(runtime, options) {
  const deadline = runtime.now() + 120_000;
  while (runtime.now() < deadline) {
    const output = await commandText(
      runtime,
      "gh",
      [
        "run",
        "list",
        "--repo",
        options.repo,
        "--workflow",
        options.workflow,
        "--branch",
        options.branch,
        "--limit",
        "20",
        "--json",
        "databaseId,status,conclusion,headSha,url,createdAt,displayTitle",
      ],
      `list ${options.workflow} runs`,
    );
    const runs = parseJson(output, "gh run list");
    const run = runs.find((candidate) => {
      const expectedTitle =
        typeof options.expectedTitle === "function"
          ? options.expectedTitle(candidate)
          : options.expectedTitle;
      return (
        (!options.headSha || candidate.headSha === options.headSha) &&
        (!options.createdAfter || Date.parse(candidate.createdAt) >= options.createdAfter) &&
        (!expectedTitle || candidate.displayTitle === expectedTitle)
      );
    });
    if (run !== undefined) {
      if (!Number.isSafeInteger(run.databaseId) || run.databaseId <= 0)
        throw new Error(`${options.workflow} run is missing a valid databaseId.`);
      return run;
    }
    await runtime.delay(5_000);
  }
  throw new Error(`Unable to find ${options.workflow} run for ${options.repo}@${options.branch}.`);
}

async function watchIfNeeded(runtime, repo, run, label, options = {}) {
  if (run.status === "completed" && run.conclusion === "success") return;
  if (run.status === "completed") {
    await throwRunFailure(runtime, repo, run, label, options, {
      fallbackMessage: `${label} failed: conclusion=${run.conclusion ?? "unknown"} (${run.url}).`,
    });
  }
  const result = await runtime.runCommand(
    "gh",
    ["run", "watch", String(run.databaseId), "--repo", repo, "--exit-status"],
    { inherit: true },
  );
  if (result.exitCode !== 0) {
    await throwRunFailure(runtime, repo, run, label, options, {
      fallbackMessage: `Unable to watch ${label}: exit code ${result.exitCode}.`,
    });
  }
}

async function throwRunFailure(runtime, repo, run, label, options, failure) {
  const admission = await detectRunnerAdmissionFailure(runtime, repo, run.databaseId);
  if (admission !== undefined) {
    throw new RunnerAdmissionError({
      label,
      run,
      annotation: admission.annotation,
      skipOrphanAudit: options.skipOrphanAuditOnRunnerAdmissionFailure === true,
    });
  }
  throw new Error(failure.fallbackMessage);
}

async function detectRunnerAdmissionFailure(runtime, repo, runId) {
  let jobsPayload;
  try {
    jobsPayload = parseJson(
      await commandText(
        runtime,
        "gh",
        ["api", `repos/${repo}/actions/runs/${runId}/jobs?filter=all&per_page=100`],
        `inspect jobs for failed run ${runId}`,
      ),
      `jobs for failed run ${runId}`,
    );
  } catch {
    return undefined;
  }

  const jobs = jobsPayload?.jobs;
  if (
    !Array.isArray(jobs) ||
    jobs.length === 0 ||
    !Number.isSafeInteger(jobsPayload?.total_count) ||
    jobsPayload.total_count !== jobs.length ||
    !jobs.every(
      (job) =>
        (job?.runner_id === 0 || job?.runner_id === null) &&
        Array.isArray(job?.steps) &&
        job.steps.length === 0 &&
        Number.isSafeInteger(job?.id) &&
        job.id > 0,
    )
  ) {
    return undefined;
  }

  for (const job of jobs) {
    let annotations;
    try {
      annotations = parseJson(
        await commandText(
          runtime,
          "gh",
          ["api", `repos/${repo}/check-runs/${job.id}/annotations?per_page=100`],
          `inspect annotations for failed job ${job.id}`,
        ),
        `annotations for failed job ${job.id}`,
      );
    } catch {
      continue;
    }
    if (!Array.isArray(annotations)) continue;
    const annotation = annotations.find((candidate) =>
      isActionsBillingAdmissionMessage(
        [candidate?.title, candidate?.message, candidate?.raw_details]
          .filter((value) => typeof value === "string")
          .join(" "),
      ),
    );
    if (annotation !== undefined) return { annotation };
  }
  return undefined;
}

function isActionsBillingAdmissionMessage(message) {
  return /(?:account payments? (?:have )?failed|spending limit|included (?:actions )?minutes|actions minutes|billing)/i.test(
    message,
  );
}

async function commandText(runtime, executable, args, label) {
  const result = await runtime.runCommand(executable, args);
  if (result.exitCode !== 0) throw new Error(`Unable to ${label}.\n${bounded(result.stderr)}`);
  return result.stdout.trim();
}

async function command(runtime, executable, args, label, options = {}) {
  const result = await runtime.runCommand(executable, args, options);
  if (result.exitCode !== 0)
    throw new Error(
      `Unable to ${label}: exit code ${result.exitCode}.${options.inherit ? "" : `\n${bounded(result.stderr)}`}`,
    );
}

function appendOption(args, flag, value) {
  if (value !== undefined) args.push(flag, value);
}
function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Unable to parse ${label} output: ${error.message}`);
  }
}
function isRepo(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}
function isSha(value) {
  return /^[a-fA-F0-9]{40}$/.test(value);
}
function isEvidenceId(value) {
  return /^[0-9a-f]{32}$/.test(value);
}
function isHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
function bounded(value) {
  return value.trim().slice(0, 2000);
}
function usageFailure(runtime, message) {
  runtime.error(message);
  runtime.log(usageText);
  throw new UsageError();
}
class UsageError extends Error {
  constructor() {
    super("Invalid release evidence orchestration arguments.");
    this.exitCode = 2;
  }
}

class RunnerAdmissionError extends Error {
  constructor({ label, run, annotation, skipOrphanAudit }) {
    const annotationMessage = [annotation?.title, annotation?.message]
      .filter((value) => typeof value === "string" && value.trim() !== "")
      .join(": ");
    const boundedAnnotationMessage = bounded(annotationMessage);
    const auditMessage = skipOrphanAudit
      ? " The orphan audit was not dispatched because no full-write or cleanup step ran, so this run could not create repository residue."
      : "";
    super(
      `${label} never started: GitHub assigned no runner and ran no workflow steps for run ${run.databaseId} (${run.url}). ` +
        `Check-run annotations report an Actions billing or included-minutes limit${boundedAnnotationMessage === "" ? "." : `: ${boundedAnnotationMessage}`}` +
        " Wait for included minutes to reset or resolve GitHub Billing & plans, then retry." +
        auditMessage +
        " The release gate remains failed.",
    );
    this.name = "RunnerAdmissionError";
    this.skipOrphanAudit = skipOrphanAudit;
  }
}

function defaultRuntime() {
  return {
    now: () => Date.now(),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    randomEvidenceId: () => randomBytes(16).toString("hex"),
    log: console.log,
    error: console.error,
    runCommand,
  };
}

function runCommand(commandName, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (!options.inherit) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runReleaseCandidateEvidenceOrchestrator(process.argv.slice(2)));
}
