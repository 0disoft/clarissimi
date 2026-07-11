import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaults = {
  repo: "0disoft/clarissimi",
  branch: "main",
  workflow: "CI",
};

const usageText = [
  "Usage:",
  "  pnpm run hosted-ci-validation -- [--repo <owner/name>] [--branch <branch-name>] [--sha <commit-sha>] [--workflow <workflow-name-or-file>]",
  "",
  "Examples:",
  "  pnpm run hosted-ci-validation",
  "  pnpm run hosted-ci-validation -- --sha 0123456789abcdef0123456789abcdef01234567",
  "",
  "The script checks the hosted GitHub Actions workflow result for a commit. It does not read secrets.",
  "`--ref` is accepted as a compatibility alias for `--branch`.",
].join("\n");

export async function runHostedCiValidation(argv, runtime = defaultRuntime()) {
  try {
    return await run(argv, runtime);
  } catch (error) {
    if (error instanceof UsageError) {
      return error.exitCode;
    }

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

  const repo = args.repo ?? defaults.repo;
  if (
    args.branch !== undefined &&
    args.ref !== undefined &&
    args.branch !== args.ref
  ) {
    return usageFailure(
      runtime,
      "--branch and --ref must match when both are provided.",
    );
  }

  const branch = args.branch ?? args.ref ?? defaults.branch;
  const workflow = args.workflow ?? defaults.workflow;

  if (!isGitHubRepositoryName(repo)) {
    return usageFailure(runtime, "--repo must use owner/name format.");
  }

  if (branch.trim().length === 0) {
    return usageFailure(runtime, "--branch requires a non-empty value.");
  }

  if (workflow.trim().length === 0) {
    return usageFailure(runtime, "--workflow requires a non-empty value.");
  }

  const sha = args.sha ?? (await readCurrentHeadSha(runtime));
  if (!isCommitSha(sha)) {
    return usageFailure(runtime, "--sha must be a 40-character commit SHA.");
  }

  await requireGh(runtime);

  const runInfo = await findWorkflowRun(runtime, {
    repo,
    branch,
    workflow,
    sha,
  });

  if (runInfo.status === "completed") {
    if (runInfo.conclusion === "success") {
      runtime.log(`hosted CI validation passed: ${runInfo.url}`);
      return 0;
    }

    throw new Error(
      `Hosted CI validation failed for ${sha}: conclusion=${runInfo.conclusion || "unknown"} (${runInfo.url}).`,
    );
  }

  runtime.log(`watching hosted CI validation run ${runInfo.databaseId}`);
  await watchRun(runtime, repo, String(runInfo.databaseId));
  runtime.log(`hosted CI validation passed: ${runInfo.url}`);
  return 0;
}

function parseArgs(argv, runtime) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    const key = arg.startsWith("--") ? arg.slice(2) : undefined;
    if (key === undefined) {
      return usageFailure(runtime, `Unexpected positional argument: ${arg}`);
    }

    if (!["repo", "branch", "ref", "sha", "workflow"].includes(key)) {
      return usageFailure(runtime, `Unsupported option: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return usageFailure(runtime, `${arg} requires a value.`);
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function usageFailure(runtime, message) {
  runtime.error(message);
  runtime.log(usageText);
  throw new UsageError();
}

function isGitHubRepositoryName(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{40}$/.test(value);
}

function isPositiveRunId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0;
  }

  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    return false;
  }

  return Number.isSafeInteger(Number(value));
}

class UsageError extends Error {
  constructor() {
    super("Invalid hosted CI validation arguments.");
    this.exitCode = 2;
  }
}

async function readCurrentHeadSha(runtime) {
  const result = await runtime.runCommand("git", ["rev-parse", "HEAD"]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Unable to resolve current HEAD SHA.\n${boundedOutput(result.stderr)}`,
    );
  }

  return result.stdout.trim();
}

async function requireGh(runtime) {
  const result = await runtime.runCommand("gh", ["--version"]);
  if (result.exitCode !== 0) {
    throw new Error("GitHub CLI is required to run hosted CI validation.");
  }
}

async function findWorkflowRun(runtime, options) {
  const startedAt = runtime.now();
  const timeoutMs = 120_000;
  const pollIntervalMs = 5_000;

  while (runtime.now() - startedAt < timeoutMs) {
    const result = await runtime.runCommand("gh", [
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
      "databaseId,status,conclusion,headSha,url,createdAt",
    ]);
    if (result.exitCode !== 0) {
      throw new Error(
        `Unable to list hosted CI workflow runs.\n${boundedOutput(result.stderr)}`,
      );
    }

    let runs;
    try {
      runs = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Unable to parse gh run list output: ${error.message}`);
    }

    if (!Array.isArray(runs)) {
      throw new Error("gh run list output must be a JSON array.");
    }

    const runInfo = runs.find((candidate) => candidate.headSha === options.sha);
    if (runInfo !== undefined) {
      return validateRunInfo(runInfo, options.workflow, options.sha);
    }

    await runtime.delay(pollIntervalMs);
  }

  throw new Error(
    `Unable to find ${options.workflow} workflow run for ${options.repo}@${options.branch} and ${options.sha}.`,
  );
}

function validateRunInfo(runInfo, workflow, sha) {
  if (!isPositiveRunId(runInfo.databaseId)) {
    throw new Error(
      `${workflow} workflow run for ${sha} is missing a valid databaseId.`,
    );
  }

  if (
    runInfo.url === undefined ||
    typeof runInfo.url !== "string" ||
    !runInfo.url.startsWith("https://")
  ) {
    throw new Error(
      `${workflow} workflow run for ${sha} is missing an https URL.`,
    );
  }

  if (
    runInfo.status !== "completed" &&
    runInfo.status !== "queued" &&
    runInfo.status !== "in_progress"
  ) {
    throw new Error(
      `${workflow} workflow run for ${sha} has unsupported status=${runInfo.status}.`,
    );
  }

  if (
    runInfo.status === "completed" &&
    typeof runInfo.conclusion !== "string"
  ) {
    throw new Error(
      `${workflow} workflow run for ${sha} is completed without a string conclusion.`,
    );
  }

  return runInfo;
}

async function watchRun(runtime, repo, runId) {
  const result = await runtime.runCommand(
    "gh",
    ["run", "watch", runId, "--repo", repo, "--exit-status"],
    {
      inherit: true,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Hosted CI validation failed with exit code ${result.exitCode}.`,
    );
  }
}

function defaultRuntime() {
  return {
    now: () => Date.now(),
    delay,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    runCommand,
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function boundedOutput(value) {
  return value.trim().slice(0, 2000);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const exitCode = await runHostedCiValidation(process.argv.slice(2));
  process.exit(exitCode);
}
