import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { parseAuthorizedActionReleaseVersion } from "./action-release-version.mjs";

const defaults = {
  repo: "0disoft/clarissimi",
};

const usageText = [
  "Usage:",
  "  pnpm run verify-action-major-tag -- --release-version <v0.x.y|v1.x.y> --sha <commit-sha> [--alias <v0|v1>] [--repo <owner/name>]",
  "",
  "Example:",
  "  pnpm run verify-action-major-tag -- --release-version v0.1.1 --sha 0123456789abcdef0123456789abcdef01234567",
  "",
  "The command is read-only. It verifies that the moving major alias, immutable version tag,",
  "and GitHub Release all identify the expected Action commit.",
].join("\n");

export async function runVerifyActionMajorTag(argv, runtime = defaultRuntime()) {
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

  const releaseVersion = parseAuthorizedActionReleaseVersion(args.releaseVersion);
  if (releaseVersion === undefined) {
    return usageFailure(
      runtime,
      "--release-version must be an authorized immutable v0.x.y or v1.x.y tag.",
    );
  }
  const alias = args.alias ?? releaseVersion.alias;
  const repo = args.repo ?? defaults.repo;
  if (!isGitHubRepositoryName(repo)) {
    return usageFailure(runtime, "--repo must use owner/name format.");
  }
  if (alias !== releaseVersion.alias) {
    return usageFailure(
      runtime,
      `--alias must be ${releaseVersion.alias} for ${releaseVersion.version}.`,
    );
  }
  if (!isCommitSha(args.sha)) {
    return usageFailure(runtime, "--sha must be a 40-character commit SHA.");
  }

  await requireTools(runtime);
  const remoteUrl = `https://github.com/${repo}.git`;
  const refs = await readRemoteTags(runtime, remoteUrl, [alias, args.releaseVersion]);
  assertTagTarget(refs, alias, args.sha);
  assertTagTarget(refs, args.releaseVersion, args.sha);

  const release = await readRelease(runtime, repo, args.releaseVersion);
  if (release.tagName !== args.releaseVersion) {
    throw new Error(`GitHub Release tag must be ${args.releaseVersion}.`);
  }
  if (release.isDraft !== false) {
    throw new Error(`GitHub Release ${args.releaseVersion} must not be a draft.`);
  }
  if (releaseVersion.major === 1 && release.isPrerelease !== false) {
    throw new Error(
      `GitHub Release ${args.releaseVersion} must not be a prerelease on the stable v1 line.`,
    );
  }
  if (typeof release.url !== "string" || !release.url.startsWith("https://github.com/")) {
    throw new Error(`GitHub Release ${args.releaseVersion} is missing a valid URL.`);
  }

  runtime.log(
    `Action major alias ${alias} verified at ${args.sha} through immutable tag ` +
      `${args.releaseVersion}: ${release.url}`,
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
    const property = {
      alias: "alias",
      repo: "repo",
      "release-version": "releaseVersion",
      sha: "sha",
    }[key];
    if (property === undefined) {
      return usageFailure(
        runtime,
        key === undefined ? `Unexpected positional argument: ${arg}` : `Unsupported option: ${arg}`,
      );
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
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{40}$/.test(value);
}

class UsageError extends Error {
  constructor() {
    super("Invalid Action major tag verification arguments.");
    this.exitCode = 2;
  }
}

async function requireTools(runtime) {
  for (const command of ["git", "gh"]) {
    const args = command === "git" ? ["--version"] : ["--version"];
    const result = await runtime.runCommand(command, args);
    if (result.exitCode !== 0) {
      throw new Error(`${command} is required to verify the Action major alias.`);
    }
  }
}

async function readRemoteTags(runtime, remoteUrl, tags) {
  const refs = tags.flatMap((tag) => [`refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  const result = await runtime.runCommand("git", ["ls-remote", "--tags", remoteUrl, ...refs]);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to read remote Action tags.\n${boundedOutput(result.stderr)}`);
  }

  const parsed = new Map();
  for (const line of result.stdout.trim().split(/\r?\n/u)) {
    if (line.length === 0) {
      continue;
    }
    const match = /^([a-fA-F0-9]{40})\s+(refs\/tags\/[^\s]+)$/.exec(line);
    if (match === null) {
      throw new Error("Remote Action tag output is malformed.");
    }
    parsed.set(match[2], match[1].toLowerCase());
  }
  return parsed;
}

function assertTagTarget(refs, tag, expectedSha) {
  const direct = refs.get(`refs/tags/${tag}`);
  const peeled = refs.get(`refs/tags/${tag}^{}`);
  const target = peeled ?? direct;
  if (target === undefined) {
    throw new Error(`Remote Action tag ${tag} does not exist.`);
  }
  if (target !== expectedSha.toLowerCase()) {
    throw new Error(`Remote Action tag ${tag} resolves to ${target}, expected ${expectedSha}.`);
  }
}

async function readRelease(runtime, repo, version) {
  const result = await runtime.runCommand("gh", [
    "release",
    "view",
    version,
    "--repo",
    repo,
    "--json",
    "tagName,isDraft,isPrerelease,url",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to read GitHub Release ${version}.\n${boundedOutput(result.stderr)}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse GitHub Release metadata: ${error.message}`);
  }
}

function defaultRuntime() {
  return {
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    runCommand,
  };
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function boundedOutput(value) {
  return value.trim().slice(0, 2000);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runVerifyActionMajorTag(process.argv.slice(2));
  process.exit(exitCode);
}
