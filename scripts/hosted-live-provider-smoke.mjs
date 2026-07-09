import { spawn } from "node:child_process";

const workflowFile = "clarissimi-live-provider-smoke.yml";
const requiredSecretName = "CLARISSIMI_PROVIDER_TOKEN";
const defaults = {
  repo: "0disoft/clarissimi",
  ref: "main"
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    writeUsage();
    return;
  }

  if (args.model === undefined) {
    console.error("hosted live provider smoke requires --model <provider-model>.");
    writeUsage();
    process.exit(2);
  }

  const repo = args.repo ?? defaults.repo;
  const ref = args.ref ?? defaults.ref;

  await requireGh();
  await requireRepositorySecret(repo, requiredSecretName);

  const dispatchedAfter = new Date(Date.now() - 30_000);
  await dispatchWorkflow({
    repo,
    ref,
    model: args.model,
    endpoint: args.endpoint,
    thinking: args.thinking
  });

  const runId = await findDispatchedRun({
    repo,
    ref,
    dispatchedAfter
  });

  console.log(`watching hosted live provider smoke run ${runId}`);
  await watchRun(repo, runId);
  console.log(`hosted live provider smoke passed: https://github.com/${repo}/actions/runs/${runId}`);
}

function parseArgs(argv) {
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
      throwUsage(`Unexpected positional argument: ${arg}`);
    }

    if (!["repo", "ref", "model", "endpoint", "thinking"].includes(key)) {
      throwUsage(`Unsupported option: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throwUsage(`${arg} requires a value.`);
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function throwUsage(message) {
  console.error(message);
  writeUsage();
  process.exit(2);
}

function writeUsage() {
  console.log([
    "Usage:",
    "  pnpm run hosted-live-provider-smoke -- --model <provider-model> [--endpoint <chat-completions-url>] [--thinking <mode>] [--repo <owner/name>] [--ref <git-ref>]",
    "",
    "Examples:",
    "  pnpm run hosted-live-provider-smoke -- --model gpt-4.1-mini",
    "  pnpm run hosted-live-provider-smoke -- --model minimax-m3 --endpoint https://example.com/v1/chat/completions --thinking disabled",
    "",
    "The script checks only that the repository secret name exists. It never reads or prints the secret value."
  ].join("\n"));
}

async function requireGh() {
  const result = await runCommand("gh", ["--version"]);
  if (result.exitCode !== 0) {
    throw new Error("GitHub CLI is required to run hosted live provider smoke.");
  }
}

async function requireRepositorySecret(repo, secretName) {
  const result = await runCommand("gh", [
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
      "Set it before running hosted live provider smoke. No workflow was dispatched."
    );
  }

  console.log(`repository secret ${secretName} is configured for ${repo}`);
}

async function dispatchWorkflow(options) {
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

  const result = await runCommand("gh", args);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to dispatch ${workflowFile}.\n${boundedOutput(result.stderr)}`);
  }

  console.log(`dispatched ${workflowFile} on ${options.repo}@${options.ref}`);
}

async function findDispatchedRun(options) {
  const startedAt = Date.now();
  const timeoutMs = 120_000;
  const pollIntervalMs = 5_000;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await runCommand("gh", [
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
      "databaseId,createdAt,headBranch,headSha,status,conclusion"
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
      return Number.isFinite(createdAt) && createdAt >= options.dispatchedAfter.getTime();
    });
    if (run !== undefined) {
      return String(run.databaseId);
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`Unable to find dispatched ${workflowFile} run for ${options.repo}@${options.ref}.`);
}

async function watchRun(repo, runId) {
  const result = await runCommand("gh", [
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
