import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const workflowFile = "clarissimi-live-provider-smoke.yml";
const requiredSecretName = "CLARISSIMI_PROVIDER_TOKEN";
const defaults = {
  repo: "0disoft/clarissimi",
  ref: "main"
};
const usageText = [
  "Usage:",
  "  pnpm run hosted-live-provider-smoke -- --model <provider-model> [--endpoint <chat-completions-url>] [--thinking <mode>] [--evidence-id <32-hex>] [--repo <owner/name>] [--ref <git-ref>]",
  "",
  "Examples:",
  "  pnpm run hosted-live-provider-smoke -- --model gpt-4.1-mini",
  "  pnpm run hosted-live-provider-smoke -- --model minimax-m3 --endpoint https://example.com/v1/chat/completions --thinking disabled",
  "",
  "The script checks only that the repository secret name exists. It never reads or prints the secret value."
].join("\n");

export async function runHostedLiveProviderSmoke(argv, runtime = defaultRuntime()) {
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

  if (args.model === undefined) {
    runtime.error("hosted live provider smoke requires --model <provider-model>.");
    runtime.log(usageText);
    return 2;
  }
  if (args.model.trim().length === 0) {
    return usageFailure(runtime, "--model requires a non-empty value.");
  }

  if (args.endpoint !== undefined && !isHttpsUrl(args.endpoint)) {
    return usageFailure(runtime, "--endpoint must be an https URL.");
  }

  if (args.thinking !== undefined && args.thinking !== "disabled") {
    return usageFailure(runtime, "--thinking supports only disabled.");
  }
  if (args.evidenceId !== undefined && !isEvidenceId(args.evidenceId)) {
    return usageFailure(runtime, "--evidence-id must be 32 lowercase hexadecimal characters.");
  }

  const repo = args.repo ?? defaults.repo;
  const ref = args.ref ?? defaults.ref;

  if (!isGitHubRepositoryName(repo)) {
    return usageFailure(runtime, "--repo must use owner/name format.");
  }

  if (ref.trim().length === 0) {
    return usageFailure(runtime, "--ref requires a non-empty value.");
  }

  await requireGh(runtime);
  await requireRepositorySecret(runtime, repo, requiredSecretName);

  const dispatchedAfter = new Date(runtime.now() - 30_000);
  await dispatchWorkflow(runtime, {
    repo,
    ref,
    model: args.model,
    endpoint: args.endpoint,
    thinking: args.thinking,
    evidenceId: args.evidenceId
  });

  const runId = await findDispatchedRun(runtime, {
    repo,
    ref,
    dispatchedAfter,
    evidenceId: args.evidenceId
  });

  runtime.log(`watching hosted live provider smoke run ${runId}`);
  await watchRun(runtime, repo, runId);
  runtime.log(`hosted live provider smoke passed: https://github.com/${repo}/actions/runs/${runId}`);
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

    if (!["repo", "ref", "model", "endpoint", "thinking", "evidence-id"].includes(key)) {
      return usageFailure(runtime, `Unsupported option: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return usageFailure(runtime, `${arg} requires a value.`);
    }

    parsed[key === "evidence-id" ? "evidenceId" : key] = value;
    index += 1;
  }

  return parsed;
}

function usageFailure(runtime, message) {
  runtime.error(message);
  runtime.log(usageText);
  throw new UsageError();
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isGitHubRepositoryName(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isEvidenceId(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
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
    super("Invalid hosted live provider smoke arguments.");
    this.exitCode = 2;
  }
}

async function requireGh(runtime) {
  const result = await runtime.runCommand("gh", ["--version"]);
  if (result.exitCode !== 0) {
    throw new Error("GitHub CLI is required to run hosted live provider smoke.");
  }
}

async function requireRepositorySecret(runtime, repo, secretName) {
  const result = await runtime.runCommand("gh", [
    "secret",
    "list",
    "--repo",
    repo,
    "--app",
    "actions",
    "--json",
    "name"
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to list repository secrets for ${repo}.\n${boundedOutput(result.stderr)}`);
  }

  let secrets;
  try {
    secrets = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse gh secret list output: ${error.message}`);
  }

  if (!Array.isArray(secrets) || !secrets.some((secret) => secret.name === secretName)) {
    throw new Error(
      `Missing repository secret ${secretName} for ${repo}. ` +
      "Set it before running hosted live provider smoke. " +
      `Example: $env:OPENAI_API_KEY | gh secret set ${secretName} --repo ${repo} --app actions. ` +
      "No workflow was dispatched."
    );
  }

  runtime.log(`repository secret ${secretName} is configured for ${repo}`);
}

async function dispatchWorkflow(runtime, options) {
  const args = [
    "workflow",
    "run",
    workflowFile,
    "--repo",
    options.repo,
    "--ref",
    options.ref,
    "-f",
    `provider-model=${options.model}`
  ];

  if (options.endpoint !== undefined) {
    args.push("-f", `provider-endpoint=${options.endpoint}`);
  }

  if (options.thinking !== undefined) {
    args.push("-f", `provider-thinking=${options.thinking}`);
  }
  if (options.evidenceId !== undefined) {
    args.push("-f", `evidence-id=${options.evidenceId}`);
  }

  const result = await runtime.runCommand("gh", args);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to dispatch ${workflowFile}.\n${boundedOutput(result.stderr)}`);
  }

  runtime.log(`dispatched ${workflowFile} on ${options.repo}@${options.ref}`);
}

async function findDispatchedRun(runtime, options) {
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
      workflowFile,
      "--event",
      "workflow_dispatch",
      "--branch",
      options.ref,
      "--limit",
      "5",
      "--json",
      "databaseId,createdAt,displayTitle,headBranch,headSha,status,conclusion"
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`Unable to list dispatched workflow runs.\n${boundedOutput(result.stderr)}`);
    }

    let runs;
    try {
      runs = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Unable to parse gh run list output: ${error.message}`);
    }

    const run = runs.find((candidate) => {
      const createdAt = Date.parse(candidate.createdAt);
      const expectedTitle = options.evidenceId === undefined
        ? undefined
        : `Clarissimi live provider smoke · ${options.evidenceId}`;
      return Number.isFinite(createdAt)
        && createdAt >= options.dispatchedAfter.getTime()
        && (expectedTitle === undefined || candidate.displayTitle === expectedTitle);
    });
    if (run !== undefined) {
      if (!isPositiveRunId(run.databaseId)) {
        throw new Error(`Dispatched ${workflowFile} run is missing a valid databaseId.`);
      }

      return String(run.databaseId);
    }

    await runtime.delay(pollIntervalMs);
  }

  throw new Error(`Unable to find dispatched ${workflowFile} run for ${options.repo}@${options.ref}.`);
}

async function watchRun(runtime, repo, runId) {
  const result = await runtime.runCommand("gh", [
    "run",
    "watch",
    runId,
    "--repo",
    repo,
    "--exit-status"
  ], {
    inherit: true
  });
  if (result.exitCode !== 0) {
    throw new Error(`Hosted live provider smoke failed with exit code ${result.exitCode}.`);
  }
}

function defaultRuntime() {
  return {
    now: () => Date.now(),
    delay,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    runCommand
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"]
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runHostedLiveProviderSmoke(process.argv.slice(2));
  process.exit(exitCode);
}
