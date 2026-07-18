import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { parseAuthorizedActionReleaseVersion } from "./action-release-version.mjs";

const defaults = {
  repo: "0disoft/clarissimi",
  externalRepo: "0disoft/integration-lab",
  providerModel: "gpt-4.1-mini",
};

const usageText = [
  "Usage:",
  "  pnpm run promote-action-major-alias -- --release-version <v0.x.y|v1.x.y> --sha <commit-sha> [--alias <v0|v1>] [--repo <owner/name>] [--external-repo <owner/name>] [--provider-model <model>]",
  "",
  "Moves the matching Action major alias with a compare-and-swap lease, verifies it, runs hosted evidence, and rolls back on failure.",
].join("\n");

export async function runPromoteActionMajorAlias(argv, runtime = defaultRuntime()) {
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

  const releaseVersion = parseAuthorizedActionReleaseVersion(args.releaseVersion);
  if (releaseVersion === undefined)
    return usageFailure(
      runtime,
      "--release-version requires an authorized immutable v0.x.y or v1.x.y tag.",
    );
  const alias = args.alias ?? releaseVersion.alias;
  const repo = args.repo ?? defaults.repo;
  const externalRepo = args.externalRepo ?? defaults.externalRepo;
  const providerModel = args.providerModel ?? defaults.providerModel;
  if (alias !== releaseVersion.alias)
    return usageFailure(
      runtime,
      `--alias must be ${releaseVersion.alias} for ${releaseVersion.version}.`,
    );
  if (!isSha(args.sha)) return usageFailure(runtime, "--sha must be a 40-character commit SHA.");
  if (!isRepo(repo) || !isRepo(externalRepo))
    return usageFailure(runtime, "--repo and --external-repo must use owner/name format.");
  if (providerModel.trim() === "")
    return usageFailure(runtime, "--provider-model requires a non-empty value.");

  await command(runtime, "git", ["--version"], "find Git");
  await command(runtime, "gh", ["--version"], "find GitHub CLI");
  const worktree = await commandText(runtime, "git", ["status", "--porcelain"], "check worktree");
  if (worktree !== "") throw new Error("Major alias promotion requires a clean worktree.");

  const remoteUrl = `https://github.com/${repo}.git`;
  const immutable = await readRemoteTag(runtime, remoteUrl, args.releaseVersion);
  if (immutable === undefined || immutable.commitSha.toLowerCase() !== args.sha.toLowerCase()) {
    throw new Error(
      `Immutable tag ${args.releaseVersion} must resolve to ${args.sha}; ` +
        `found ${immutable?.commitSha ?? "missing"}.`,
    );
  }
  await validateRelease(runtime, repo, releaseVersion);
  await preflightWorkflows(runtime, repo, externalRepo, args.releaseVersion);

  const previous = await readRemoteTag(runtime, remoteUrl, alias);
  if (previous?.annotated === true) {
    throw new Error(`Moving alias ${alias} must be a lightweight tag before promotion.`);
  }
  if (previous !== undefined && previous.commitSha.toLowerCase() !== args.sha.toLowerCase()) {
    await command(
      runtime,
      "git",
      ["cat-file", "-e", `${previous.commitSha}^{commit}`],
      "prove rollback object is local",
    );
  }

  const changed = previous?.commitSha.toLowerCase() !== args.sha.toLowerCase();
  if (changed) {
    await pushAlias(runtime, remoteUrl, alias, args.sha, previous?.refSha);
  }

  try {
    await verifyAndCollectEvidence(runtime, {
      alias,
      repo,
      externalRepo,
      releaseVersion: args.releaseVersion,
      sha: args.sha,
      providerModel,
    });
  } catch (error) {
    if (!changed) throw error;
    try {
      await rollbackAlias(runtime, remoteUrl, alias, args.sha, previous?.refSha);
    } catch (rollbackError) {
      throw new Error(
        `Major alias verification failed: ${message(error)}\n` +
          `Automatic rollback also failed: ${message(rollbackError)}`,
      );
    }
    throw new Error(
      `Major alias verification failed and ${alias} was rolled back to ` +
        `${previous?.commitSha ?? "absence"}: ${message(error)}`,
    );
  }

  const published = await readRemoteTag(runtime, remoteUrl, alias);
  if (published?.commitSha.toLowerCase() !== args.sha.toLowerCase()) {
    throw new Error(`Remote alias ${alias} drifted after verification.`);
  }

  runtime.log(
    JSON.stringify(
      {
        alias,
        releaseVersion: args.releaseVersion,
        sha: args.sha,
        previousSha: previous?.commitSha ?? null,
        changed,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function validateRelease(runtime, repo, releaseVersion) {
  const version = releaseVersion.version;
  const output = await commandText(
    runtime,
    "gh",
    ["release", "view", version, "--repo", repo, "--json", "tagName,isDraft,isPrerelease,url"],
    `read GitHub Release ${version}`,
  );
  const release = parseJson(output, "gh release view");
  if (
    release.tagName !== version ||
    release.isDraft !== false ||
    typeof release.url !== "string" ||
    !release.url.startsWith("https://github.com/")
  ) {
    throw new Error(`GitHub Release ${version} is missing or does not satisfy ADR 0034.`);
  }
  if (releaseVersion.major === 1 && release.isPrerelease !== false) {
    throw new Error(`GitHub Release ${version} must not be a prerelease on the stable v1 line.`);
  }
}

async function preflightWorkflows(runtime, repo, externalRepo, releaseVersion) {
  const workflows = [
    [repo, releaseVersion, "clarissimi-live-provider-smoke.yml"],
    [externalRepo, "main", "clarissimi.yml"],
    [externalRepo, "main", "clarissimi-full-write-smoke.yml"],
    [externalRepo, "main", "clarissimi-orphan-audit.yml"],
  ];
  for (const [workflowRepo, ref, workflow] of workflows) {
    await command(
      runtime,
      "gh",
      ["workflow", "view", workflow, "--repo", workflowRepo, "--ref", ref, "--yaml"],
      `preflight ${workflowRepo} workflow ${workflow}`,
    );
  }
}

async function verifyAndCollectEvidence(runtime, options) {
  await command(
    runtime,
    "pnpm",
    [
      "run",
      "verify-action-major-tag",
      "--",
      "--release-version",
      options.releaseVersion,
      "--sha",
      options.sha,
      "--alias",
      options.alias,
      "--repo",
      options.repo,
    ],
    "verify promoted major alias",
    { inherit: true },
  );
  await command(
    runtime,
    "pnpm",
    [
      "run",
      "release-candidate-evidence-orchestrator",
      "--",
      "--provider-model",
      options.providerModel,
      "--release-type",
      "major-alias",
      "--release-version",
      options.releaseVersion,
      "--external-ref",
      options.alias,
      "--sha",
      options.sha,
      "--repo",
      options.repo,
      "--external-repo",
      options.externalRepo,
    ],
    "collect promoted alias evidence",
    { inherit: true },
  );
}

async function pushAlias(runtime, remoteUrl, alias, sha, expectedRefSha) {
  await command(
    runtime,
    "git",
    [
      "push",
      `--force-with-lease=refs/tags/${alias}:${expectedRefSha ?? ""}`,
      remoteUrl,
      `${sha}:refs/tags/${alias}`,
    ],
    `promote ${alias} with compare-and-swap lease`,
  );
}

async function rollbackAlias(runtime, remoteUrl, alias, promotedSha, previousRefSha) {
  const refspec =
    previousRefSha === undefined ? `:refs/tags/${alias}` : `${previousRefSha}:refs/tags/${alias}`;
  await command(
    runtime,
    "git",
    ["push", `--force-with-lease=refs/tags/${alias}:${promotedSha}`, remoteUrl, refspec],
    `roll back ${alias}`,
  );
  const restored = await readRemoteTag(runtime, remoteUrl, alias);
  if ((restored?.refSha ?? undefined) !== previousRefSha) {
    throw new Error(`Remote alias ${alias} did not return to its recorded state.`);
  }
}

async function readRemoteTag(runtime, remoteUrl, tag) {
  const output = await commandText(
    runtime,
    "git",
    ["ls-remote", remoteUrl, `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    `read remote tag ${tag}`,
  );
  if (output === "") return undefined;
  const lines = output.split(/\r?\n/);
  const direct = parseRefLine(lines.find((line) => line.endsWith(`refs/tags/${tag}`)));
  const peeled = parseRefLine(lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`)));
  if (direct === undefined) throw new Error(`Remote tag ${tag} is missing its direct ref.`);
  return {
    refSha: direct,
    commitSha: peeled ?? direct,
    annotated: peeled !== undefined,
  };
}

function parseRefLine(line) {
  if (line === undefined) return undefined;
  const sha = line.split(/\s+/)[0];
  if (!isSha(sha)) throw new Error("Remote tag returned an invalid object id.");
  return sha;
}

function parseArgs(argv, runtime) {
  const parsed = {};
  const options = {
    alias: "alias",
    repo: "repo",
    "external-repo": "externalRepo",
    "provider-model": "providerModel",
    "release-version": "releaseVersion",
    sha: "sha",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    const property = arg.startsWith("--") ? options[arg.slice(2)] : undefined;
    if (property === undefined) return usageFailure(runtime, `Unsupported argument: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      return usageFailure(runtime, `${arg} requires a value.`);
    parsed[property] = value;
    index += 1;
  }
  return parsed;
}

function isRepo(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}
function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}
function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function usageFailure(runtime, text) {
  runtime.error(text);
  runtime.log(usageText);
  throw new UsageError();
}
class UsageError extends Error {
  constructor() {
    super("Invalid major alias promotion arguments.");
    this.exitCode = 2;
  }
}
async function commandText(runtime, executable, args, label) {
  const result = await runtime.runCommand(executable, args);
  if (result.exitCode !== 0)
    throw new Error(`${label} failed.\n${bounded(result.stderr || result.stdout)}`);
  return result.stdout.trim();
}
async function command(runtime, executable, args, label, options = {}) {
  const result = await runtime.runCommand(executable, args, options);
  if (result.exitCode !== 0)
    throw new Error(
      `${label} failed.${options.inherit ? "" : `\n${bounded(result.stderr || result.stdout)}`}`,
    );
}
function bounded(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 2000);
}
function defaultRuntime() {
  return {
    log: console.log,
    error: console.error,
    runCommand: (commandName, args, options = {}) =>
      new Promise((resolve, reject) => {
        const child = spawn(commandName, args, {
          stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
          windowsHide: true,
          env: process.env,
        });
        let stdout = "";
        let stderr = "";
        if (!options.inherit) {
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk) => (stdout += chunk));
          child.stderr.on("data", (chunk) => (stderr += chunk));
        }
        child.on("error", reject);
        child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
      }),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runPromoteActionMajorAlias(process.argv.slice(2)));
}
