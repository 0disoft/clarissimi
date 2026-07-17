import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaults = {
  repo: "0disoft/clarissimi",
  branch: "main",
  releaseKind: "prerelease",
};

const usageText = [
  "Usage:",
  "  pnpm run publish-action-release -- --version <v0.x.y> [--sha <commit-sha>] [--repo <owner/name>] [--branch <branch>] [--notes-template <path>] [--release-kind <prerelease|stable>]",
  "",
  "Publishes an immutable annotated tag and GitHub release only after finding one matching release evidence issue.",
].join("\n");

const candidateReleaseReferenceContracts = [
  { path: "README.md", kind: "action-reference" },
  { path: "docs/github-action/README.md", kind: "action-reference" },
  { path: "SECURITY.md", kind: "supported-version" },
];

export async function runPublishActionRelease(argv, runtime = defaultRuntime()) {
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
  const branch = args.branch ?? defaults.branch;
  const releaseKind = args.releaseKind ?? defaults.releaseKind;
  if (!isRepo(repo)) return usageFailure(runtime, "--repo must use owner/name format.");
  if (!isVersion(args.version))
    return usageFailure(runtime, "--version requires an immutable v0.x.y tag.");
  if (branch.trim() === "") return usageFailure(runtime, "--branch requires a non-empty value.");
  if (!["prerelease", "stable"].includes(releaseKind))
    return usageFailure(runtime, "--release-kind supports prerelease or stable.");
  if (args.sha !== undefined && !isSha(args.sha))
    return usageFailure(runtime, "--sha must be a 40-character commit SHA.");

  await command(runtime, "gh", ["--version"], "find GitHub CLI");
  const worktree = await commandText(runtime, "git", ["status", "--porcelain"], "check worktree");
  if (worktree.trim() !== "") throw new Error("Release publication requires a clean worktree.");

  const sha =
    args.sha ?? (await commandText(runtime, "git", ["rev-parse", "HEAD"], "resolve current HEAD"));
  if (!isSha(sha)) throw new Error("Current HEAD did not resolve to a commit SHA.");
  const remoteSha = await commandText(
    runtime,
    "gh",
    ["api", `repos/${repo}/commits/${sha}`, "--jq", ".sha"],
    "resolve remote candidate commit",
  );
  if (remoteSha.toLowerCase() !== sha.toLowerCase())
    throw new Error(`Remote candidate resolved to ${remoteSha}, expected ${sha}.`);

  await validateCandidateReleaseReferences(runtime, {
    repo,
    version: args.version,
    sha,
  });

  const issue = await findEvidenceIssue(runtime, { repo, version: args.version, sha });
  const notesTemplate = args.notesTemplate ?? `scripts/release-notes/${args.version}.md`;
  const notes = await runtime.readText(notesTemplate);
  const releaseNotes = renderNotes(notes, {
    version: args.version,
    sha,
    evidenceIssueUrl: issue.url,
  });

  const remoteTagSha = await resolveRemoteTag(runtime, args.version);
  if (remoteTagSha !== undefined && remoteTagSha.toLowerCase() !== sha.toLowerCase()) {
    throw new Error(`Remote tag ${args.version} points to ${remoteTagSha}, expected ${sha}.`);
  }
  if (remoteTagSha === undefined) {
    await ensureLocalTag(runtime, args.version, sha);
    await command(
      runtime,
      "git",
      ["push", "origin", `refs/tags/${args.version}`],
      `push immutable tag ${args.version}`,
    );
  }

  let release = await readRelease(runtime, repo, args.version);
  if (release === undefined) {
    const createArgs = [
      "release",
      "create",
      args.version,
      "--repo",
      repo,
      "--title",
      `Clarissimi ${args.version}`,
      "--verify-tag",
      "--notes-file",
      "-",
    ];
    if (releaseKind === "prerelease") createArgs.splice(8, 0, "--prerelease");
    await command(runtime, "gh", createArgs, `create GitHub ${releaseKind} ${args.version}`, {
      input: releaseNotes,
    });
    release = await readRelease(runtime, repo, args.version);
  }
  validateRelease(release, args.version, releaseKind);

  const publishedSha = await commandText(
    runtime,
    "gh",
    ["api", `repos/${repo}/commits/${args.version}`, "--jq", ".sha"],
    "resolve published release tag",
  );
  if (publishedSha.toLowerCase() !== sha.toLowerCase())
    throw new Error(`Published tag resolves to ${publishedSha}, expected ${sha}.`);

  if (issue.state.toUpperCase() !== "CLOSED") {
    await command(
      runtime,
      "gh",
      [
        "issue",
        "close",
        String(issue.number),
        "--repo",
        repo,
        "--comment",
        `Published ${args.version}: ${release.url}`,
      ],
      "close completed release evidence issue",
    );
  }

  runtime.log(
    JSON.stringify(
      {
        version: args.version,
        sha,
        releaseUrl: release.url,
        releaseKind,
        evidenceIssueUrl: issue.url,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function validateCandidateReleaseReferences(runtime, options) {
  for (const contract of candidateReleaseReferenceContracts) {
    const text = await commandText(
      runtime,
      "git",
      ["show", `${options.sha}:${contract.path}`],
      `read candidate ${contract.path}`,
    );

    if (contract.kind === "supported-version") {
      const expected = `\`${options.version}\``;
      if (!text.includes(expected)) {
        throw new Error(
          `Candidate ${contract.path} must identify ${expected} as the supported immutable release before publication.`,
        );
      }
      continue;
    }

    const expected = `${options.repo}@${options.version}`;
    if (!text.includes(expected)) {
      throw new Error(`Candidate ${contract.path} must contain ${expected} before publication.`);
    }

    const immutableVersions = new Set(
      [...text.matchAll(new RegExp(`${escapeRegExp(options.repo)}@(v0\\.\\d+\\.\\d+)`, "g"))].map(
        (match) => match[1],
      ),
    );
    const staleVersions = [...immutableVersions]
      .filter((version) => version !== options.version)
      .sort();
    if (staleVersions.length > 0) {
      throw new Error(
        `Candidate ${contract.path} contains stale immutable Action references (${staleVersions.join(", ")}); expected only ${options.version}.`,
      );
    }
  }
}

async function findEvidenceIssue(runtime, options) {
  const shortSha = options.sha.slice(0, 7);
  const title = `Release candidate evidence for ${options.version} at ${shortSha}`;
  const output = await commandText(
    runtime,
    "gh",
    [
      "issue",
      "list",
      "--repo",
      options.repo,
      "--state",
      "all",
      "--search",
      `"${title}" in:title`,
      "--json",
      "number,title,body,url,state",
      "--limit",
      "100",
    ],
    "find release evidence issue",
  );
  const issues = parseJson(output, "gh issue list");
  if (!Array.isArray(issues)) throw new Error("GitHub returned invalid release evidence metadata.");
  const matches = issues.filter(
    (issue) =>
      issue.title === title &&
      typeof issue.body === "string" &&
      issue.body.includes(`\`${options.sha}\``) &&
      issue.body.includes(`\`${options.version}\``),
  );
  if (matches.length !== 1)
    throw new Error(
      `Expected one release evidence issue titled ${title}, found ${matches.length}.`,
    );
  const issue = matches[0];
  if (!Number.isInteger(issue.number) || typeof issue.url !== "string" || issue.url === "")
    throw new Error("Release evidence issue metadata is incomplete.");
  return issue;
}

async function resolveRemoteTag(runtime, version) {
  const result = await runtime.runCommand("git", [
    "ls-remote",
    "origin",
    `refs/tags/${version}`,
    `refs/tags/${version}^{}`,
  ]);
  if (result.exitCode !== 0)
    throw new Error(`Unable to inspect remote tag ${version}.\n${bounded(result.stderr)}`);
  const lines = result.stdout.trim() === "" ? [] : result.stdout.trim().split(/\r?\n/);
  const peeled = lines.find((line) => line.endsWith(`refs/tags/${version}^{}`));
  const direct = lines.find((line) => line.endsWith(`refs/tags/${version}`));
  const selected = peeled ?? direct;
  if (selected === undefined) return undefined;
  const sha = selected.split(/\s+/)[0];
  if (!isSha(sha)) throw new Error(`Remote tag ${version} returned an invalid object id.`);
  return sha;
}

async function ensureLocalTag(runtime, version, sha) {
  const result = await runtime.runCommand("git", ["rev-parse", `${version}^{commit}`]);
  if (result.exitCode === 0) {
    const existing = result.stdout.trim();
    if (existing.toLowerCase() !== sha.toLowerCase())
      throw new Error(`Local tag ${version} points to ${existing}, expected ${sha}.`);
    return;
  }
  await command(
    runtime,
    "git",
    ["tag", "-a", version, sha, "-m", `Clarissimi ${version}`],
    `create annotated tag ${version}`,
  );
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
  if (result.exitCode !== 0) return undefined;
  return parseJson(result.stdout, "gh release view");
}

function validateRelease(release, version, releaseKind) {
  const expectedPrerelease = releaseKind === "prerelease";
  if (
    release === undefined ||
    release.tagName !== version ||
    release.isDraft !== false ||
    release.isPrerelease !== expectedPrerelease ||
    typeof release.url !== "string" ||
    release.url === ""
  ) {
    throw new Error(
      `GitHub release ${version} is missing or does not match the ${releaseKind} contract.`,
    );
  }
}

function renderNotes(template, values) {
  const notes = template
    .replaceAll("{{VERSION}}", values.version)
    .replaceAll("{{SHA}}", values.sha)
    .replaceAll("{{EVIDENCE_ISSUE_URL}}", values.evidenceIssueUrl);
  if (/\{\{[A-Z0-9_]+\}\}/.test(notes))
    throw new Error("Release notes template contains an unresolved placeholder.");
  return notes;
}

function parseArgs(argv, runtime) {
  const parsed = {};
  const valueOptions = new Map([
    ["version", "version"],
    ["sha", "sha"],
    ["repo", "repo"],
    ["branch", "branch"],
    ["notes-template", "notesTemplate"],
    ["release-kind", "releaseKind"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) return usageFailure(runtime, `Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (!valueOptions.has(key)) return usageFailure(runtime, `Unsupported option: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      return usageFailure(runtime, `${arg} requires a value.`);
    parsed[valueOptions.get(key)] = value;
    index += 1;
  }
  return parsed;
}

function isRepo(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isVersion(value) {
  return typeof value === "string" && /^v0\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(value);
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value.trim());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function usageFailure(runtime, message) {
  runtime.error(message);
  runtime.error(usageText);
  throw new UsageError();
}

class UsageError extends Error {
  constructor() {
    super("Invalid command usage.");
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
    throw new Error(`${label} failed.\n${bounded(result.stderr || result.stdout)}`);
}

function bounded(value) {
  const text = String(value ?? "").trim();
  return text.length <= 2000 ? text : `${text.slice(0, 2000)}…`;
}

function defaultRuntime() {
  return {
    log: console.log,
    error: console.error,
    readText: (path) => readFile(path, "utf8"),
    runCommand: (commandName, args, options = {}) =>
      new Promise((resolve, reject) => {
        const child = spawn(commandName, args, {
          stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
          windowsHide: true,
          env: process.env,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
        if (options.input !== undefined) child.stdin.end(options.input);
      }),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runPublishActionRelease(process.argv.slice(2)));
}
