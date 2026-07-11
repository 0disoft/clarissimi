import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaults = {
  repo: "0disoft/integration-lab",
  workflow: "clarissimi.yml",
  workflowRef: "main",
};

const usageText = [
  "Usage:",
  "  pnpm run hosted-external-consumer-smoke -- [--clarissimi-ref <immutable-tag-or-sha|v0>] [--expected-sha <commit-sha>] [--evidence-id <32-hex>] [--repo <owner/name>] [--workflow <workflow-file>] [--workflow-ref <git-ref>]",
  "",
  "Examples:",
  "  pnpm run hosted-external-consumer-smoke",
  "  pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0.1.1",
  "  pnpm run hosted-external-consumer-smoke -- --clarissimi-ref v0 --expected-sha 0123456789abcdef0123456789abcdef01234567",
  "",
  "When --clarissimi-ref is omitted, the script tests the current Clarissimi HEAD SHA.",
  "The moving v0 alias is accepted only with --expected-sha so the consumer checkout can prove its target.",
].join("\n");

export async function runHostedExternalConsumerSmoke(argv, runtime = defaultRuntime()) {
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
  const workflow = args.workflow ?? defaults.workflow;
  const workflowRef = args.workflowRef ?? defaults.workflowRef;
  const clarissimiRef = args.clarissimiRef ?? (await readCurrentHeadSha(runtime));
  const expectedSha = args.expectedSha;

  if (!isGitHubRepositoryName(repo)) {
    return usageFailure(runtime, "--repo must use owner/name format.");
  }

  if (workflow.trim().length === 0) {
    return usageFailure(runtime, "--workflow requires a non-empty value.");
  }

  if (workflowRef.trim().length === 0) {
    return usageFailure(runtime, "--workflow-ref requires a non-empty value.");
  }

  if (!isImmutableClarissimiRef(clarissimiRef) && clarissimiRef !== "v0") {
    return usageFailure(
      runtime,
      "--clarissimi-ref must be an immutable semantic version tag, 40-character commit SHA, or v0.",
    );
  }

  if (expectedSha !== undefined && !isCommitSha(expectedSha)) {
    return usageFailure(runtime, "--expected-sha must be a 40-character commit SHA.");
  }

  if (clarissimiRef === "v0" && expectedSha === undefined) {
    return usageFailure(runtime, "--expected-sha is required when --clarissimi-ref is v0.");
  }
  if (args.evidenceId !== undefined && !isEvidenceId(args.evidenceId)) {
    return usageFailure(runtime, "--evidence-id must be 32 lowercase hexadecimal characters.");
  }

  await requireGh(runtime);

  const dispatchedAfter = new Date(runtime.now() - 30_000);
  await dispatchWorkflow(runtime, {
    repo,
    workflow,
    workflowRef,
    clarissimiRef,
    expectedSha,
    evidenceId: args.evidenceId,
  });

  const runId = await findDispatchedRun(runtime, {
    repo,
    workflow,
    workflowRef,
    dispatchedAfter,
    clarissimiRef,
    evidenceId: args.evidenceId,
  });

  runtime.log(`watching hosted external consumer smoke run ${runId}`);
  await watchRun(runtime, repo, runId);
  runtime.log(
    `hosted external consumer smoke passed for Clarissimi ${clarissimiRef}: ` +
      `https://github.com/${repo}/actions/runs/${runId}`,
  );
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

    const property = {
      "clarissimi-ref": "clarissimiRef",
      "expected-sha": "expectedSha",
      "evidence-id": "evidenceId",
      repo: "repo",
      workflow: "workflow",
      "workflow-ref": "workflowRef",
    }[key];
    if (property === undefined) {
      return usageFailure(runtime, `Unsupported option: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return usageFailure(runtime, `${arg} requires a value.`);
    }

    parsed[property] = value;
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

function isImmutableClarissimiRef(value) {
  return (
    /^[a-fA-F0-9]{40}$/.test(value) || /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(value)
  );
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{40}$/.test(value);
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
    super("Invalid hosted external consumer smoke arguments.");
    this.exitCode = 2;
  }
}

async function readCurrentHeadSha(runtime) {
  const result = await runtime.runCommand("git", ["rev-parse", "HEAD"]);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to resolve current HEAD SHA.\n${boundedOutput(result.stderr)}`);
  }

  return result.stdout.trim();
}

async function requireGh(runtime) {
  const result = await runtime.runCommand("gh", ["--version"]);
  if (result.exitCode !== 0) {
    throw new Error("GitHub CLI is required to run hosted external consumer smoke.");
  }
}

async function dispatchWorkflow(runtime, options) {
  const dispatchArgs = [
    "workflow",
    "run",
    options.workflow,
    "--repo",
    options.repo,
    "--ref",
    options.workflowRef,
    "-f",
    `clarissimi-ref=${options.clarissimiRef}`,
  ];
  if (options.expectedSha !== undefined) {
    dispatchArgs.push("-f", `expected-sha=${options.expectedSha}`);
  }
  if (options.evidenceId !== undefined) {
    dispatchArgs.push("-f", `evidence-id=${options.evidenceId}`);
  }
  const result = await runtime.runCommand("gh", dispatchArgs);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to dispatch ${options.workflow}.\n${boundedOutput(result.stderr)}`);
  }

  runtime.log(
    `dispatched ${options.workflow} on ${options.repo}@${options.workflowRef} ` +
      `for Clarissimi ${options.clarissimiRef}` +
      (options.expectedSha === undefined ? "" : ` at expected SHA ${options.expectedSha}`),
  );
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
      options.workflow,
      "--event",
      "workflow_dispatch",
      "--branch",
      options.workflowRef,
      "--limit",
      "5",
      "--json",
      "databaseId,createdAt,displayTitle,headBranch,headSha,status,conclusion",
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

    if (!Array.isArray(runs)) {
      throw new Error("gh run list output must be a JSON array.");
    }

    const runInfo = runs.find((candidate) => {
      const createdAt = Date.parse(candidate.createdAt);
      const expectedTitle =
        options.evidenceId === undefined
          ? undefined
          : `Clarissimi external consumer · ${options.clarissimiRef} · ${options.evidenceId}`;
      return (
        Number.isFinite(createdAt) &&
        createdAt >= options.dispatchedAfter.getTime() &&
        (expectedTitle === undefined || candidate.displayTitle === expectedTitle)
      );
    });
    if (runInfo !== undefined) {
      if (!isPositiveRunId(runInfo.databaseId)) {
        throw new Error(`Dispatched ${options.workflow} run is missing a valid databaseId.`);
      }

      return String(runInfo.databaseId);
    }

    await runtime.delay(pollIntervalMs);
  }

  throw new Error(
    `Unable to find dispatched ${options.workflow} run for ` +
      `${options.repo}@${options.workflowRef}.`,
  );
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
    throw new Error(`Hosted external consumer smoke failed with exit code ${result.exitCode}.`);
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runHostedExternalConsumerSmoke(process.argv.slice(2));
  process.exit(exitCode);
}
