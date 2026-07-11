import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaults = {
  repo: "0disoft/integration-lab",
  workflowName: "Clarissimi full write smoke"
};
const runners = ["ubuntu", "macos", "windows"];
const usageText = [
  "Usage:",
  "  pnpm run release-evidence-cleanup -- --run-id <full-write-run-id> [--repo <owner/name>] [--apply]",
  "",
  "The default is a read-only JSON preview. --apply closes and deletes only resources whose names",
  "are deterministically reserved for the completed Clarissimi full-write smoke run."
].join("\n");

export async function runReleaseEvidenceCleanup(argv, runtime = defaultRuntime()) {
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

  const repo = args.repo ?? defaults.repo;
  if (!isRepo(repo)) return usageFailure(runtime, "--repo must use owner/name format.");
  if (!isPositiveRunId(args.runId)) return usageFailure(runtime, "--run-id must be a positive numeric workflow run id.");

  await requireGh(runtime);
  const run = await readFullWriteRun(runtime, repo, args.runId);
  validateFullWriteRun(run, args.runId);

  const expectedBranches = createExpectedBranches(args.runId);
  const state = await readCleanupState(runtime, repo, expectedBranches);
  const preview = createReceipt({ mode: args.apply ? "apply" : "preview", repo, run, state });
  if (!args.apply) {
    runtime.log(JSON.stringify(preview, null, 2));
    return 0;
  }

  const failures = [];
  for (const pullRequest of state.pullRequests) {
    const result = await runtime.runCommand("gh", [
      "pr", "close", String(pullRequest.number), "--repo", repo
    ]);
    if (result.exitCode !== 0) failures.push(`pull request #${pullRequest.number}: ${bounded(result.stderr)}`);
  }
  for (const branch of state.branches) {
    const result = await runtime.runCommand("gh", [
      "api", "--method", "DELETE", `repos/${repo}/git/refs/heads/${branch}`
    ]);
    if (result.exitCode !== 0) failures.push(`branch ${branch}: ${bounded(result.stderr)}`);
  }

  const remaining = await readCleanupState(runtime, repo, expectedBranches);
  const receipt = createReceipt({ mode: "applied", repo, run, state, remaining, failures });
  runtime.log(JSON.stringify(receipt, null, 2));
  if (failures.length > 0 || remaining.pullRequests.length > 0 || remaining.branches.length > 0) {
    throw new Error(
      `Clarissimi smoke cleanup for run ${args.runId} is incomplete. `
      + `failures=${failures.length} remainingPullRequests=${remaining.pullRequests.length} `
      + `remainingBranches=${remaining.branches.length}.`
    );
  }
  return 0;
}

function parseArgs(argv, runtime) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") { parsed.help = true; continue; }
    if (arg === "--apply") { parsed.apply = true; continue; }
    if (arg !== "--run-id" && arg !== "--repo") return usageFailure(runtime, `Unsupported option: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) return usageFailure(runtime, `${arg} requires a value.`);
    parsed[arg === "--run-id" ? "runId" : "repo"] = value;
    index += 1;
  }
  return parsed;
}

async function requireGh(runtime) {
  const result = await runtime.runCommand("gh", ["--version"]);
  if (result.exitCode !== 0) throw new Error("GitHub CLI is required to inspect or clean release evidence residue.");
}

async function readFullWriteRun(runtime, repo, runId) {
  const result = await runtime.runCommand("gh", [
    "run", "view", String(runId), "--repo", repo, "--json",
    "databaseId,displayTitle,event,status,conclusion,workflowName,url"
  ]);
  if (result.exitCode !== 0) throw new Error(`Unable to inspect full-write run ${runId}.\n${bounded(result.stderr)}`);
  return parseJson(result.stdout, `workflow run ${runId}`);
}

function validateFullWriteRun(run, runId) {
  if (String(run?.databaseId) !== String(runId)) throw new Error(`Full-write run ${runId} metadata has mismatched databaseId.`);
  if (run.workflowName !== defaults.workflowName) throw new Error(`Run ${runId} must be workflow ${defaults.workflowName}.`);
  if (run.event !== "workflow_dispatch") throw new Error(`Full-write run ${runId} must use workflow_dispatch.`);
  if (run.status !== "completed") throw new Error(`Full-write run ${runId} must be completed before cleanup; status=${run.status ?? "unknown"}.`);
  if (typeof run.displayTitle !== "string" || !run.displayTitle.startsWith(`${defaults.workflowName} · `) || !run.displayTitle.endsWith(` · ${runId}`)) {
    throw new Error(`Full-write run ${runId} has an unexpected display title.`);
  }
  if (typeof run.url !== "string" || !run.url.startsWith("https://github.com/")) throw new Error(`Full-write run ${runId} is missing a GitHub Actions URL.`);
}

function createExpectedBranches(runId) {
  const run = BigInt(runId);
  const branches = [];
  for (let index = 0; index < runners.length; index += 1) {
    const sourceId = 800_000_000_000_000n + (run * 10n) + BigInt(index + 1);
    branches.push(`clarissimi/smoke/${runId}/${runners[index]}/base`);
    branches.push(`clarissimi/drafts/merged_pull_request-${sourceId}`);
    branches.push(`clarissimi/recognition/merged_pull_request-${sourceId}`);
  }
  return new Set(branches);
}

async function readCleanupState(runtime, repo, expectedBranches) {
  const [pullRequestsResult, refsResult] = await Promise.all([
    runtime.runCommand("gh", [
      "pr", "list", "--repo", repo, "--state", "open", "--limit", "1000", "--json",
      "number,url,headRefName,baseRefName"
    ]),
    runtime.runCommand("gh", ["api", `repos/${repo}/git/matching-refs/heads/clarissimi`])
  ]);
  if (pullRequestsResult.exitCode !== 0) throw new Error(`Unable to list open pull requests for ${repo}.\n${bounded(pullRequestsResult.stderr)}`);
  if (refsResult.exitCode !== 0) throw new Error(`Unable to list Clarissimi branches for ${repo}.\n${bounded(refsResult.stderr)}`);

  const pullRequests = parseJson(pullRequestsResult.stdout, "open pull requests");
  const refs = parseJson(refsResult.stdout, "Clarissimi refs");
  if (!Array.isArray(pullRequests) || !Array.isArray(refs)) throw new Error("GitHub cleanup state must use JSON arrays.");

  return {
    pullRequests: pullRequests
      .filter((pullRequest) => expectedBranches.has(pullRequest.headRefName) || expectedBranches.has(pullRequest.baseRefName))
      .map(validatePullRequest)
      .sort((left, right) => left.number - right.number),
    branches: refs
      .map((ref) => typeof ref?.ref === "string" ? ref.ref.replace(/^refs\/heads\//, "") : undefined)
      .filter((branch) => branch !== undefined && expectedBranches.has(branch))
      .sort()
  };
}

function validatePullRequest(pullRequest) {
  if (!Number.isSafeInteger(pullRequest.number) || pullRequest.number <= 0) throw new Error("Cleanup pull request is missing a positive number.");
  if (typeof pullRequest.url !== "string" || !pullRequest.url.startsWith("https://github.com/")) throw new Error(`Cleanup pull request #${pullRequest.number} is missing a GitHub URL.`);
  return {
    number: pullRequest.number,
    url: pullRequest.url,
    headRefName: pullRequest.headRefName,
    baseRefName: pullRequest.baseRefName
  };
}

function createReceipt(options) {
  return {
    mode: options.mode,
    repository: options.repo,
    fullWriteRun: {
      id: options.run.databaseId,
      title: options.run.displayTitle,
      conclusion: options.run.conclusion,
      url: options.run.url
    },
    matched: {
      pullRequests: options.state.pullRequests,
      branches: options.state.branches
    },
    ...(options.remaining === undefined ? {} : {
      remaining: {
        pullRequests: options.remaining.pullRequests,
        branches: options.remaining.branches
      },
      failures: options.failures
    })
  };
}

function isRepo(value) { return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value); }
function isPositiveRunId(value) { return typeof value === "string" && /^[1-9][0-9]*$/.test(value); }
function parseJson(value, label) { try { return JSON.parse(value); } catch (error) { throw new Error(`Unable to parse ${label}: ${error.message}`); } }
function bounded(value) { return value.trim().slice(0, 2000); }
function usageFailure(runtime, message) { runtime.error(message); runtime.log(usageText); throw new UsageError(); }
class UsageError extends Error { constructor() { super("Invalid release evidence cleanup arguments."); this.exitCode = 2; } }

function defaultRuntime() {
  return { log: console.log, error: console.error, runCommand };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    if (!options.inherit) {
      child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", reject); child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runReleaseEvidenceCleanup(process.argv.slice(2)));
}
