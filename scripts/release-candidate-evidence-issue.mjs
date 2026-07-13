import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaults = {
  repo: "0disoft/clarissimi",
  branch: "main",
  releaseType: "source-only",
  ciWorkflowName: "CI",
  externalRepo: "0disoft/integration-lab",
  externalBranch: "main",
  externalWorkflowName: "Clarissimi external consumer",
  externalWriteWorkflowName: "Clarissimi full write smoke",
  externalWriteJobNames: [
    "Stage, approve, and promote (ubuntu-latest)",
    "Stage, approve, and promote (macos-latest)",
    "Stage, approve, and promote (windows-latest)",
  ],
  externalWriteRequiredSteps: [
    "Stage synthetic draft",
    "Approve and merge the draft proposal",
    "Promote approved draft",
    "Verify recognition proposal",
    "Clean up smoke pull requests and branches",
  ],
  liveWorkflowName: "Clarissimi live provider smoke",
  secretName: "CLARISSIMI_PROVIDER_TOKEN",
};

const usageText = [
  "Usage:",
  "  pnpm run release-candidate-evidence-issue -- --ci-run <run-id> --live-run <run-id> --external-run <run-id> --external-write-run <run-id> --provider-model <model> [--evidence-id <32-hex>] [--external-ref <immutable-tag-or-sha|v0>] [--live-ref <branch-or-tag>] [--external-repo <owner/name>] [--release-type <source-only|versioned-action-tag|marketplace-action-tag|major-alias>] [--release-version <v0.x.y>] [--provider-endpoint <chat-completions-url>] [--provider-thinking <mode>] [--sha <commit-sha>] [--repo <owner/name>] [--branch <branch-name>] [--title <issue-title>] [--print]",
  "",
  "Examples:",
  "  pnpm run release-candidate-evidence-issue -- --ci-run 12345 --live-run 67890 --external-run 24680 --external-write-run 13579 --provider-model gpt-4.1-mini",
  "  pnpm run release-candidate-evidence-issue -- --release-type versioned-action-tag --release-version v0.1.0 --sha 0123456789abcdef0123456789abcdef01234567 --ci-run 12345 --live-run 67890 --external-run 24680 --external-write-run 13579 --provider-model minimax-m3 --provider-endpoint https://example.com/v1/chat/completions --provider-thinking disabled --print",
  "",
  "The script validates hosted CI, hosted live-provider, external consumer, and full-write run metadata before creating the release evidence issue.",
  "It records secret names only and never reads or prints provider token values.",
].join("\n");

export async function runReleaseCandidateEvidenceIssue(argv, runtime = defaultRuntime()) {
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
  const branch = args.branch ?? defaults.branch;
  const externalRepo = args.externalRepo ?? defaults.externalRepo;

  if (!isGitHubRepositoryName(repo)) {
    return usageFailure(runtime, "--repo must use owner/name format.");
  }

  if (branch.trim().length === 0) {
    return usageFailure(runtime, "--branch requires a non-empty value.");
  }

  if (!isGitHubRepositoryName(externalRepo)) {
    return usageFailure(runtime, "--external-repo must use owner/name format.");
  }

  if (!isPositiveRunId(args.ciRun)) {
    return usageFailure(runtime, "--ci-run requires a positive numeric workflow run id.");
  }

  if (!isPositiveRunId(args.liveRun)) {
    return usageFailure(runtime, "--live-run requires a positive numeric workflow run id.");
  }

  if (args.providerModel === undefined || args.providerModel.trim().length === 0) {
    return usageFailure(runtime, "--provider-model requires a non-empty value.");
  }

  if (args.providerEndpoint !== undefined && !isHttpsUrl(args.providerEndpoint)) {
    return usageFailure(runtime, "--provider-endpoint must be an https URL.");
  }

  if (args.providerThinking !== undefined && args.providerThinking !== "disabled") {
    return usageFailure(runtime, "--provider-thinking supports only disabled.");
  }

  if (args.evidenceId !== undefined && !isEvidenceId(args.evidenceId)) {
    return usageFailure(runtime, "--evidence-id must be 32 lowercase hexadecimal characters.");
  }

  const releaseType = args.releaseType ?? defaults.releaseType;
  if (
    !["source-only", "versioned-action-tag", "marketplace-action-tag", "major-alias"].includes(
      releaseType,
    )
  ) {
    return usageFailure(
      runtime,
      "--release-type supports source-only, versioned-action-tag, marketplace-action-tag, or major-alias.",
    );
  }

  if (
    ["versioned-action-tag", "marketplace-action-tag", "major-alias"].includes(releaseType) &&
    !isVersionTag(args.releaseVersion)
  ) {
    return usageFailure(runtime, "--release-version requires a v0.x.y tag authorized by ADR 0044.");
  }

  if (releaseType === "source-only" && args.releaseVersion !== undefined) {
    return usageFailure(
      runtime,
      "--release-version is valid only with --release-type versioned-action-tag, marketplace-action-tag, or major-alias.",
    );
  }

  if (args.title !== undefined && args.title.trim().length === 0) {
    return usageFailure(runtime, "--title requires a non-empty value.");
  }

  if (!isPositiveRunId(args.externalRun)) {
    return usageFailure(runtime, "--external-run requires a positive numeric workflow run id.");
  }

  if (!isPositiveRunId(args.externalWriteRun)) {
    return usageFailure(
      runtime,
      "--external-write-run requires a positive numeric workflow run id.",
    );
  }

  const sha = args.sha ?? (await readCurrentHeadSha(runtime));
  if (!isCommitSha(sha)) {
    return usageFailure(runtime, "--sha must be a 40-character commit SHA.");
  }

  const externalRef =
    args.externalRef ??
    (["versioned-action-tag", "marketplace-action-tag"].includes(releaseType)
      ? args.releaseVersion
      : sha);
  if (!isImmutableClarissimiRef(externalRef) && externalRef !== "v0") {
    return usageFailure(
      runtime,
      "--external-ref must be a semantic version tag, 40-character commit SHA, or v0.",
    );
  }
  if (releaseType === "source-only" && externalRef !== sha) {
    return usageFailure(runtime, "source-only evidence requires --external-ref to equal --sha.");
  }
  if (
    ["versioned-action-tag", "marketplace-action-tag"].includes(releaseType) &&
    externalRef !== args.releaseVersion &&
    externalRef !== sha
  ) {
    return usageFailure(
      runtime,
      "versioned Action evidence requires --external-ref to equal --release-version or --sha.",
    );
  }
  if (releaseType === "major-alias" && externalRef !== "v0") {
    return usageFailure(runtime, "major alias evidence requires --external-ref v0.");
  }
  const liveRef = args.liveRef ?? branch;
  if (liveRef.trim() === "") {
    return usageFailure(runtime, "--live-ref requires a non-empty branch or tag.");
  }

  await requireGh(runtime);

  const ciRun = await readRun(runtime, repo, args.ciRun);
  validateRun(ciRun, {
    label: "hosted CI",
    runId: args.ciRun,
    sha,
    branch,
    workflowName: defaults.ciWorkflowName,
  });

  const liveRun = await readRun(runtime, repo, args.liveRun);
  validateRun(liveRun, {
    label: "hosted live provider smoke",
    runId: args.liveRun,
    sha,
    branch: liveRef,
    workflowName: defaults.liveWorkflowName,
    displayTitle:
      args.evidenceId === undefined
        ? undefined
        : `${defaults.liveWorkflowName} · ${args.evidenceId}`,
  });

  const externalRun = await readRun(runtime, externalRepo, args.externalRun);
  validateExternalRun(externalRun, {
    runId: args.externalRun,
    externalRef,
    evidenceId: args.evidenceId,
  });

  const externalWriteRun = await readRun(runtime, externalRepo, args.externalWriteRun);
  validateExternalWriteRun(externalWriteRun, {
    runId: args.externalWriteRun,
    externalRef,
    evidenceId: args.evidenceId,
  });

  const title =
    args.title ??
    (["versioned-action-tag", "marketplace-action-tag"].includes(releaseType)
      ? `Release candidate evidence for ${args.releaseVersion} at ${sha.slice(0, 7)}`
      : releaseType === "major-alias"
        ? `Major alias evidence for v0 to ${args.releaseVersion} at ${sha.slice(0, 7)}`
        : `Release candidate evidence for ${sha.slice(0, 7)}`);
  const body = renderIssueBody({
    repo,
    branch,
    sha,
    ciRun,
    externalRef,
    externalRepo,
    externalRun,
    externalWriteRun,
    evidenceId: args.evidenceId,
    liveRun,
    liveRef,
    releaseType,
    releaseVersion: args.releaseVersion,
    providerModel: args.providerModel,
    providerEndpoint: args.providerEndpoint,
    providerThinking: args.providerThinking,
  });

  if (args.print) {
    runtime.log(body);
    return 0;
  }

  const result = await runtime.runCommand(
    "gh",
    ["issue", "create", "--repo", repo, "--title", title, "--body-file", "-"],
    {
      input: body,
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Unable to create release candidate evidence issue.\n${boundedOutput(result.stderr)}`,
    );
  }

  runtime.log(`release candidate evidence issue created: ${result.stdout.trim()}`);
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

    if (arg === "--print" || arg === "--dry-run") {
      parsed.print = true;
      continue;
    }

    const key = arg.startsWith("--") ? arg.slice(2) : undefined;
    if (key === undefined) {
      return usageFailure(runtime, `Unexpected positional argument: ${arg}`);
    }

    if (
      ![
        "repo",
        "branch",
        "sha",
        "ci-run",
        "external-ref",
        "evidence-id",
        "external-repo",
        "external-run",
        "external-write-run",
        "live-run",
        "live-ref",
        "provider-model",
        "provider-endpoint",
        "provider-thinking",
        "release-type",
        "release-version",
        "title",
      ].includes(key)
    ) {
      return usageFailure(runtime, `Unsupported option: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return usageFailure(runtime, `${arg} requires a value.`);
    }

    parsed[toCamelCase(key)] = value;
    index += 1;
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function usageFailure(runtime, message) {
  runtime.error(message);
  runtime.log(usageText);
  throw new UsageError();
}

function isGitHubRepositoryName(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{40}$/.test(value);
}

function isEvidenceId(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

function isVersionTag(value) {
  return typeof value === "string" && /^v0\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(value);
}

function isImmutableClarissimiRef(value) {
  return (
    isCommitSha(value) ||
    (typeof value === "string" && /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(value))
  );
}

function isPositiveRunId(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    return false;
  }

  return Number.isSafeInteger(Number(value));
}

class UsageError extends Error {
  constructor() {
    super("Invalid release candidate evidence issue arguments.");
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
    throw new Error("GitHub CLI is required to create release candidate evidence issues.");
  }
}

async function readRun(runtime, repo, runId) {
  const result = await runtime.runCommand("gh", [
    "run",
    "view",
    String(runId),
    "--repo",
    repo,
    "--json",
    "databaseId,createdAt,displayTitle,headSha,headBranch,url,status,conclusion,workflowName,event,jobs",
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Unable to inspect workflow run ${runId}.\n${boundedOutput(result.stderr)}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse workflow run ${runId} metadata: ${error.message}`);
  }
}

function validateRun(run, options) {
  if (String(run?.databaseId) !== String(options.runId)) {
    throw new Error(`${options.label} run ${options.runId} metadata has mismatched databaseId.`);
  }

  if (run.workflowName !== options.workflowName) {
    throw new Error(
      `${options.label} run ${options.runId} must be workflow ${options.workflowName}.`,
    );
  }

  if (options.displayTitle !== undefined && run.displayTitle !== options.displayTitle) {
    throw new Error(
      `${options.label} run ${options.runId} must have displayTitle=${options.displayTitle}.`,
    );
  }

  if (run.headSha !== options.sha) {
    throw new Error(
      `${options.label} run ${options.runId} validates ${run.headSha ?? "unknown"}, not ${options.sha}.`,
    );
  }

  if (run.headBranch !== options.branch) {
    throw new Error(`${options.label} run ${options.runId} must be on branch ${options.branch}.`);
  }

  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(
      `${options.label} run ${options.runId} must be completed successfully; ` +
        `status=${run.status ?? "unknown"} conclusion=${run.conclusion ?? "unknown"}.`,
    );
  }

  if (typeof run.createdAt !== "string" || Number.isNaN(Date.parse(run.createdAt))) {
    throw new Error(
      `${options.label} run ${options.runId} is missing a valid createdAt timestamp.`,
    );
  }

  if (typeof run.url !== "string" || !run.url.startsWith("https://github.com/")) {
    throw new Error(`${options.label} run ${options.runId} is missing a GitHub Actions run URL.`);
  }
}

function validateExternalRun(run, options) {
  const label = "external consumer smoke";
  if (String(run?.databaseId) !== String(options.runId)) {
    throw new Error(`${label} run ${options.runId} metadata has mismatched databaseId.`);
  }

  if (run.workflowName !== defaults.externalWorkflowName) {
    throw new Error(
      `${label} run ${options.runId} must be workflow ${defaults.externalWorkflowName}.`,
    );
  }

  if (run.headBranch !== defaults.externalBranch) {
    throw new Error(`${label} run ${options.runId} must be on branch ${defaults.externalBranch}.`);
  }

  if (run.event !== "workflow_dispatch") {
    throw new Error(`${label} run ${options.runId} must use workflow_dispatch.`);
  }

  const expectedTitle =
    options.evidenceId === undefined
      ? `${defaults.externalWorkflowName} · ${options.externalRef}`
      : `${defaults.externalWorkflowName} · ${options.externalRef} · ${options.evidenceId}`;
  if (run.displayTitle !== expectedTitle) {
    throw new Error(
      `${label} run ${options.runId} must validate Clarissimi ${options.externalRef}; ` +
        `displayTitle=${run.displayTitle ?? "unknown"}.`,
    );
  }

  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(
      `${label} run ${options.runId} must be completed successfully; ` +
        `status=${run.status ?? "unknown"} conclusion=${run.conclusion ?? "unknown"}.`,
    );
  }

  if (typeof run.createdAt !== "string" || Number.isNaN(Date.parse(run.createdAt))) {
    throw new Error(`${label} run ${options.runId} is missing a valid createdAt timestamp.`);
  }

  if (typeof run.url !== "string" || !run.url.startsWith("https://github.com/")) {
    throw new Error(`${label} run ${options.runId} is missing a GitHub Actions run URL.`);
  }
}

function validateExternalWriteRun(run, options) {
  const label = "external full-write smoke";
  if (String(run?.databaseId) !== String(options.runId)) {
    throw new Error(`${label} run ${options.runId} metadata has mismatched databaseId.`);
  }

  if (run.workflowName !== defaults.externalWriteWorkflowName) {
    throw new Error(
      `${label} run ${options.runId} must be workflow ${defaults.externalWriteWorkflowName}.`,
    );
  }

  if (run.headBranch !== defaults.externalBranch) {
    throw new Error(`${label} run ${options.runId} must be on branch ${defaults.externalBranch}.`);
  }

  if (run.event !== "workflow_dispatch") {
    throw new Error(`${label} run ${options.runId} must use workflow_dispatch.`);
  }

  const expectedTitle =
    options.evidenceId === undefined
      ? `${defaults.externalWriteWorkflowName} · ${options.externalRef} · ${options.runId}`
      : `${defaults.externalWriteWorkflowName} · ${options.externalRef} · ${options.evidenceId} · ${options.runId}`;
  if (run.displayTitle !== expectedTitle) {
    throw new Error(
      `${label} run ${options.runId} must validate Clarissimi ${options.externalRef}; ` +
        `displayTitle=${run.displayTitle ?? "unknown"}.`,
    );
  }

  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(
      `${label} run ${options.runId} must be completed successfully; ` +
        `status=${run.status ?? "unknown"} conclusion=${run.conclusion ?? "unknown"}.`,
    );
  }

  if (typeof run.createdAt !== "string" || Number.isNaN(Date.parse(run.createdAt))) {
    throw new Error(`${label} run ${options.runId} is missing a valid createdAt timestamp.`);
  }

  if (typeof run.url !== "string" || !run.url.startsWith("https://github.com/")) {
    throw new Error(`${label} run ${options.runId} is missing a GitHub Actions run URL.`);
  }

  if (!Array.isArray(run.jobs)) {
    throw new Error(`${label} run ${options.runId} is missing job metadata.`);
  }

  const jobsByName = new Map(run.jobs.map((job) => [job.name, job]));
  for (const jobName of defaults.externalWriteJobNames) {
    const job = jobsByName.get(jobName);
    if (job === undefined) {
      throw new Error(`${label} run ${options.runId} is missing job ${jobName}.`);
    }
    if (job.status !== "completed" || job.conclusion !== "success") {
      throw new Error(
        `${label} run ${options.runId} job ${jobName} must be completed successfully; ` +
          `status=${job.status ?? "unknown"} conclusion=${job.conclusion ?? "unknown"}.`,
      );
    }
    if (!Array.isArray(job.steps)) {
      throw new Error(`${label} run ${options.runId} job ${jobName} is missing step metadata.`);
    }
    const stepsByName = new Map(job.steps.map((step) => [step.name, step]));
    for (const stepName of defaults.externalWriteRequiredSteps) {
      const step = stepsByName.get(stepName);
      if (step?.status !== "completed" || step?.conclusion !== "success") {
        throw new Error(
          `${label} run ${options.runId} job ${jobName} step ${stepName} must succeed.`,
        );
      }
    }
  }
}

function renderIssueBody(options) {
  const versionedReleaseDecision = options.releaseVersion?.startsWith("v0.1.")
    ? "ADR 0031"
    : "ADR 0044";
  const liveProviderCommand = [
    "pnpm run hosted-live-provider-smoke --",
    `--model ${options.providerModel}`,
    `--ref ${options.liveRef}`,
    options.providerEndpoint === undefined ? undefined : `--endpoint ${options.providerEndpoint}`,
    options.providerThinking === undefined ? undefined : `--thinking ${options.providerThinking}`,
    options.evidenceId === undefined ? undefined : `--evidence-id ${options.evidenceId}`,
  ]
    .filter(Boolean)
    .join(" ");
  const externalConsumerCommand = [
    "pnpm run hosted-external-consumer-smoke --",
    `--clarissimi-ref ${options.externalRef}`,
    options.externalRef === "v0" ? `--expected-sha ${options.sha}` : undefined,
    options.evidenceId === undefined ? undefined : `--evidence-id ${options.evidenceId}`,
    options.externalRepo === defaults.externalRepo ? undefined : `--repo ${options.externalRepo}`,
  ]
    .filter(Boolean)
    .join(" ");
  const externalWriteCommand = [
    `gh workflow run clarissimi-full-write-smoke.yml --repo ${options.externalRepo}`,
    `--ref ${defaults.externalBranch}`,
    `-f clarissimi-ref=${options.externalRef}`,
    options.externalRef === "v0" ? `-f expected-sha=${options.sha}` : undefined,
    options.evidenceId === undefined ? undefined : `-f evidence-id=${options.evidenceId}`,
  ]
    .filter(Boolean)
    .join(" ");
  const releaseType =
    options.releaseType === "marketplace-action-tag"
      ? `GitHub Marketplace Action tag \`${options.releaseVersion}\` under ADR 0045`
      : options.releaseType === "versioned-action-tag"
        ? `versioned Action tag \`${options.releaseVersion}\` under ${versionedReleaseDecision}`
        : options.releaseType === "major-alias"
          ? `moving Action alias \`v0\` to \`${options.releaseVersion}\` under ADR 0034`
          : "source-only merge evidence";
  const releaseDecision =
    options.releaseType === "marketplace-action-tag"
      ? "ADR 0045"
      : options.releaseType === "versioned-action-tag"
        ? versionedReleaseDecision
        : options.releaseType === "major-alias"
          ? "ADR 0034"
          : "`docs/ops/release.md` source-only merge policy";
  const releasePolicyConclusion =
    options.releaseType === "marketplace-action-tag"
      ? `This evidence supports publishing immutable tag \`${options.releaseVersion}\` at \`${options.sha}\` as a non-prerelease GitHub Release, then enabling its GitHub Marketplace listing under ADR 0045. Moving alias \`v0\` remains a separate ADR 0034 step after post-tag and Marketplace verification.`
      : options.releaseType === "versioned-action-tag"
        ? `This evidence supports publishing immutable tag \`${options.releaseVersion}\` at \`${options.sha}\` and creating its GitHub pre-release. Moving alias \`v0\` remains a separate ADR 0034 step after post-tag verification.`
        : options.releaseType === "major-alias"
          ? `This evidence supports keeping moving alias \`v0\` at immutable release \`${options.releaseVersion}\` commit \`${options.sha}\`. Consumers that require reproducibility should pin the immutable tag or commit SHA.`
          : "This evidence supports a source-only merge. A versioned Action tag requires the release type and version to be recorded explicitly.";

  return [
    `Release candidate evidence for \`${options.sha}\` on \`${options.branch}\`.`,
    "",
    "## Candidate",
    "",
    `- Repository: \`${options.repo}\``,
    `- Branch: \`${options.branch}\``,
    `- Candidate SHA: \`${options.sha}\``,
    `- Evidence correlation id: ${options.evidenceId === undefined ? "not used" : `\`${options.evidenceId}\``}`,
    `- Release type: ${releaseType}`,
    `- Release decision: ${releaseDecision}`,
    "- Package status: root and workspace packages remain private at `0.0.0`; public package publication remains blocked.",
    options.releaseType === "marketplace-action-tag"
      ? "- Marketplace status: authorized by ADR 0045 for this validated root Action release; interactive publication and public listing verification remain pending."
      : "- Marketplace status: GitHub Marketplace publication remains blocked.",
    "",
    "## Hosted CI Evidence",
    "",
    `- Command: \`pnpm run hosted-ci-validation -- --sha ${options.sha}\``,
    "- Result: passed",
    `- Workflow: \`${defaults.ciWorkflowName}\``,
    `- Run: ${options.ciRun.url}`,
    `- Run id: \`${options.ciRun.databaseId}\``,
    `- Created at: \`${options.ciRun.createdAt}\``,
    `- Validated SHA: \`${options.ciRun.headSha}\``,
    "",
    "## Hosted Live Provider Evidence",
    "",
    `- Command: \`${liveProviderCommand}\``,
    "- Result: passed",
    `- Workflow: \`${defaults.liveWorkflowName}\``,
    `- Run: ${options.liveRun.url}`,
    `- Run id: \`${options.liveRun.databaseId}\``,
    `- Created at: \`${options.liveRun.createdAt}\``,
    `- Validated SHA: \`${options.liveRun.headSha}\``,
    `- Repository secret used by workflow: \`${defaults.secretName}\``,
    `- Dispatch model input: \`${options.providerModel}\``,
    `- Provider endpoint override: ${options.providerEndpoint === undefined ? "not used" : `\`${options.providerEndpoint}\``}`,
    `- Provider thinking mode: ${options.providerThinking === undefined ? "not used" : `\`${options.providerThinking}\``}`,
    "",
    "## External Consumer Evidence",
    "",
    `- Command: \`${externalConsumerCommand}\``,
    "- Result: passed",
    `- Repository: \`${options.externalRepo}\``,
    `- Workflow: \`${defaults.externalWorkflowName}\``,
    `- Run: ${options.externalRun.url}`,
    `- Run id: \`${options.externalRun.databaseId}\``,
    `- Created at: \`${options.externalRun.createdAt}\``,
    `- Clarissimi ref: \`${options.externalRef}\``,
    `- Consumer workflow SHA: \`${options.externalRun.headSha}\``,
    "",
    "## External Full-Write Evidence",
    "",
    `- Command: \`${externalWriteCommand}\``,
    "- Result: passed",
    `- Repository: \`${options.externalRepo}\``,
    `- Workflow: \`${defaults.externalWriteWorkflowName}\``,
    `- Run: ${options.externalWriteRun.url}`,
    `- Run id: \`${options.externalWriteRun.databaseId}\``,
    `- Created at: \`${options.externalWriteRun.createdAt}\``,
    `- Clarissimi ref: \`${options.externalRef}\``,
    `- Consumer workflow SHA: \`${options.externalWriteRun.headSha}\``,
    `- Runner jobs: ${defaults.externalWriteJobNames.map((name) => `\`${name}\``).join(", ")}`,
    "- Required stage, approval, promotion, recognition verification, and cleanup steps: passed",
    "",
    "## Release Policy",
    "",
    releasePolicyConclusion,
    "",
  ].join("\n");
}

function defaultRuntime() {
  return {
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    runCommand,
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function boundedOutput(value) {
  return value.trim().slice(0, 2000);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runReleaseCandidateEvidenceIssue(process.argv.slice(2));
  process.exit(exitCode);
}
