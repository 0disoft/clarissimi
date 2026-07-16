import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import { CONTRIBUTIONS_JSONL_PATH, parseContributionsJsonl } from "@clarissimi/renderers";
import {
  collectMergedPullRequestEvidence,
  collectLiveMergedPullRequestEvidence,
  createGitHubApiClient,
  parseGitHubMergedPullRequestFixture,
} from "@clarissimi/github";
import {
  createFakeContributionDraftProvider,
  createOpenAiCompatibleContributionDraftProvider,
  OpenAiCompatibleProviderError,
  type ContributionDraftProvider,
} from "@clarissimi/providers";
import {
  isConfigProvider,
  isConfigProviderEndpointTrust,
  isConfigProviderThinking,
  isConfigMarkdownSummary,
  isApprovalStatus,
  type ApprovalStatus,
  type ClarissimiConfig,
  type ConfigProviderThinking,
  type ConfigProviderEndpointTrust,
  type ContributionAssessment,
  type ValidationIssue,
  validateClarissimiConfig,
  validateContributionAssessment,
} from "@clarissimi/schemas";

import { publishProposalBranch } from "./branch-publisher.js";
import { writeProposalBranch } from "./branch-writer.js";
import { createDirectCommit, publishDirectCommit } from "./direct-commit.js";
import { resolveGitHubEventPayload } from "./event.js";
import { createGitHubPullRequestClient } from "./github-client.js";
import {
  createOrUpdateProposalPullRequest,
  type ProposalPullRequest,
  type ProposalPullRequestClient,
} from "./pull-request.js";
import {
  isSourceCommentMode,
  upsertSourcePullRequestComment,
  type SourceCommentMode,
  type SourcePullRequestCommentClient,
  type SourcePullRequestCommentUpsertResult,
} from "./source-comment.js";
import {
  stageProposalDraftReviewOutput,
  stageProposalRecognitionOutputs,
  type ProposalOutputStagingManifest,
} from "./staging.js";
import { sanitizeAssessmentForActionSummary } from "./summary.js";
import type {
  ActionMode,
  ActionCommitInput,
  ActionCommitSummary,
  ActionDryRunInput,
  ActionDryRunSummary,
  ActionInputSource,
  ActionPromoteDraftInput,
  ActionProposeInput,
  ActionProposeSummary,
  ActionProcessIo,
  ActionStageDraftInput,
  ActionRunSummary,
} from "./types.js";
import { isActionMode } from "./types.js";

export class ActionUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionUsageError";
  }
}

export async function runActionDryRun(input: ActionDryRunInput): Promise<ActionDryRunSummary> {
  const mode = input.mode ?? "dry-run";
  if (mode !== "dry-run") {
    throw new ActionUsageError("runActionDryRun supports only dry-run mode.");
  }

  const prepared = await prepareActionAssessment(input);

  if (prepared.kind === "skipped") {
    return {
      ok: true,
      mode: "dry-run",
      inputSource: prepared.inputSource,
      draftCount: 0,
      proposedEntryCount: 0,
      skippedEntryCount: 1,
      publicOutputsRendered: false,
      approvalStatus: null,
      redactionChanged: false,
      redactionMatchCount: 0,
      skippedReason: prepared.reason,
    };
  }

  return {
    ok: true,
    mode: "dry-run",
    inputSource: prepared.inputSource,
    draftCount: 1,
    proposedEntryCount: 0,
    skippedEntryCount: 0,
    publicOutputsRendered: false,
    approvalStatus: prepared.assessment.maintainerApprovalStatus,
    redactionChanged: prepared.redactionChanged,
    redactionMatchCount: prepared.redactionMatchCount,
    assessment: sanitizeAssessmentForActionSummary(prepared.assessment),
  };
}

export async function runActionPropose(input: ActionProposeInput): Promise<ActionProposeSummary> {
  validateSourceCommentInput(input);
  const prepared = await prepareActionAssessment(input);
  if (prepared.kind === "skipped") {
    throw new ActionUsageError("Propose mode requires a merged pull request input.");
  }

  const staging = await stageProposalRecognitionOutputs({
    outputDir: input.stagingDir,
    assessments: [prepared.assessment],
    existingRecords: await readExistingRecognitionRecords(input.repositoryDir),
    redactionMatchCount: prepared.redactionMatchCount,
    ...(input.markdownSummary === undefined ? {} : { markdownSummary: input.markdownSummary }),
    ...(input.includeAutomationContributors === undefined
      ? {}
      : { includeAutomationContributors: input.includeAutomationContributors }),
  });
  const branch = await writeProposalBranch({
    repositoryDir: input.repositoryDir,
    stagedOutputDir: input.stagingDir,
    manifest: staging.manifest,
    baseBranch: input.baseBranch,
  });
  const publishInput: Parameters<typeof publishProposalBranch>[0] = {
    repositoryDir: input.repositoryDir,
    branch,
  };
  assignOptional(publishInput, "remoteName", input.remoteName);
  await publishProposalBranch(publishInput);
  const pullRequestInput: Parameters<typeof createOrUpdateProposalPullRequest>[0] = {
    client: input.pullRequestClient,
    manifest: staging.manifest,
    branch,
  };
  assignOptional(pullRequestInput, "targetRepository", input.targetRepository);
  const pullRequest = await createOrUpdateProposalPullRequest(pullRequestInput);
  const sourceComment = await maybeUpsertProposalSourceComment(
    input,
    staging.manifest,
    pullRequest.pullRequest,
    "recognition",
  );

  return {
    ok: true,
    mode: "propose",
    inputSource: prepared.inputSource,
    draftCount: 1,
    proposedEntryCount: 1,
    skippedEntryCount: 0,
    publicOutputsRendered: true,
    approvalStatus: prepared.assessment.maintainerApprovalStatus as "approved" | "auto_approved",
    redactionChanged: prepared.redactionChanged,
    redactionMatchCount: prepared.redactionMatchCount,
    stagedFileCount: staging.manifest.files.length,
    proposalBranch: branch.branchName,
    proposalCommitSha: branch.commitSha,
    proposalPullRequestNumber: pullRequest.pullRequest.number,
    proposalPullRequestUrl: pullRequest.pullRequest.url,
    proposalPullRequestAction: pullRequest.action,
    ...(sourceComment === undefined
      ? {}
      : {
          sourceCommentAction: sourceComment.action,
          sourceCommentUrl: sourceComment.comment.url,
        }),
  };
}

export async function runActionCommit(input: ActionCommitInput): Promise<ActionCommitSummary> {
  const prepared = await prepareActionAssessment(input);
  if (prepared.kind === "skipped") {
    throw new ActionUsageError("Commit mode requires a merged pull request input.");
  }

  const staging = await stageProposalRecognitionOutputs({
    outputDir: input.stagingDir,
    assessments: [prepared.assessment],
    existingRecords: await readExistingRecognitionRecords(input.repositoryDir),
    redactionMatchCount: prepared.redactionMatchCount,
    ...(input.markdownSummary === undefined ? {} : { markdownSummary: input.markdownSummary }),
    ...(input.includeAutomationContributors === undefined
      ? {}
      : { includeAutomationContributors: input.includeAutomationContributors }),
  });
  const commitInput: Parameters<typeof createDirectCommit>[0] = {
    repositoryDir: input.repositoryDir,
    stagedOutputDir: input.stagingDir,
    manifest: staging.manifest,
    targetBranch: input.targetBranch,
  };
  assignOptional(commitInput, "expectedHeadSha", input.expectedHeadSha);
  const commit = await createDirectCommit(commitInput);
  const publishInput: Parameters<typeof publishDirectCommit>[0] = {
    repositoryDir: input.repositoryDir,
    commit,
  };
  assignOptional(publishInput, "remoteName", input.remoteName);
  const published = await publishDirectCommit(publishInput);

  return {
    ok: true,
    mode: "commit",
    inputSource: prepared.inputSource,
    draftCount: 1,
    proposedEntryCount: 1,
    skippedEntryCount: 0,
    publicOutputsRendered: true,
    approvalStatus: prepared.assessment.maintainerApprovalStatus as "approved" | "auto_approved",
    redactionChanged: prepared.redactionChanged,
    redactionMatchCount: prepared.redactionMatchCount,
    stagedFileCount: staging.manifest.files.length,
    directCommitBranch: commit.targetBranch,
    directCommitBaseSha: commit.baseCommitSha,
    directCommitSha: commit.commitSha,
    directCommitCreated: commit.commitCreated,
    directCommitPushed: published.pushed,
  };
}

export async function runActionStageDraft(
  input: ActionStageDraftInput,
): Promise<ActionProposeSummary> {
  validateSourceCommentInput(input);
  const prepared = await prepareActionAssessment(input);
  if (prepared.kind === "skipped") {
    throw new ActionUsageError("Stage-draft mode requires a merged pull request input.");
  }

  const staging = await stageProposalDraftReviewOutput({
    outputDir: input.stagingDir,
    assessments: [prepared.assessment],
    redactionMatchCount: prepared.redactionMatchCount,
  });
  const branch = await writeProposalBranch({
    repositoryDir: input.repositoryDir,
    stagedOutputDir: input.stagingDir,
    manifest: staging.manifest,
    baseBranch: input.baseBranch,
  });
  const publishInput: Parameters<typeof publishProposalBranch>[0] = {
    repositoryDir: input.repositoryDir,
    branch,
  };
  assignOptional(publishInput, "remoteName", input.remoteName);
  await publishProposalBranch(publishInput);
  const pullRequestInput: Parameters<typeof createOrUpdateProposalPullRequest>[0] = {
    client: input.pullRequestClient,
    manifest: staging.manifest,
    branch,
    maintainerApprovalNote:
      "This pull request stages an unapproved Clarissimi draft. Review and edit the draft, then approve and import it before public recognition.",
  };
  assignOptional(pullRequestInput, "targetRepository", input.targetRepository);
  const pullRequest = await createOrUpdateProposalPullRequest(pullRequestInput);
  const sourceComment = await maybeUpsertProposalSourceComment(
    input,
    staging.manifest,
    pullRequest.pullRequest,
    "draft-review",
  );

  return {
    ok: true,
    mode: "stage-draft",
    inputSource: prepared.inputSource,
    draftCount: 1,
    proposedEntryCount: 0,
    skippedEntryCount: 0,
    publicOutputsRendered: false,
    approvalStatus: prepared.assessment.maintainerApprovalStatus,
    redactionChanged: prepared.redactionChanged,
    redactionMatchCount: prepared.redactionMatchCount,
    stagedFileCount: staging.manifest.files.length,
    proposalBranch: branch.branchName,
    proposalCommitSha: branch.commitSha,
    proposalPullRequestNumber: pullRequest.pullRequest.number,
    proposalPullRequestUrl: pullRequest.pullRequest.url,
    proposalPullRequestAction: pullRequest.action,
    ...(sourceComment === undefined
      ? {}
      : {
          sourceCommentAction: sourceComment.action,
          sourceCommentUrl: sourceComment.comment.url,
        }),
  };
}

export async function runActionPromoteDraft(
  input: ActionPromoteDraftInput,
): Promise<ActionProposeSummary> {
  validateSourceCommentInput(input);
  const assessment = await readApprovedDraft(input.draftPath, input.repositoryDir);
  const staging = await stageProposalRecognitionOutputs({
    outputDir: input.stagingDir,
    assessments: [assessment],
    existingRecords: await readExistingRecognitionRecords(input.repositoryDir),
    redactionMatchCount: 0,
    ...(input.markdownSummary === undefined ? {} : { markdownSummary: input.markdownSummary }),
    ...(input.includeAutomationContributors === undefined
      ? {}
      : { includeAutomationContributors: input.includeAutomationContributors }),
  });
  const branch = await writeProposalBranch({
    repositoryDir: input.repositoryDir,
    stagedOutputDir: input.stagingDir,
    manifest: staging.manifest,
    baseBranch: input.baseBranch,
  });
  const publishInput: Parameters<typeof publishProposalBranch>[0] = {
    repositoryDir: input.repositoryDir,
    branch,
  };
  assignOptional(publishInput, "remoteName", input.remoteName);
  await publishProposalBranch(publishInput);
  const pullRequestInput: Parameters<typeof createOrUpdateProposalPullRequest>[0] = {
    client: input.pullRequestClient,
    manifest: staging.manifest,
    branch,
    maintainerApprovalNote:
      "This recognition proposal was rendered from an explicitly approved Clarissimi draft. Maintainers still own the final merge decision.",
  };
  assignOptional(pullRequestInput, "targetRepository", input.targetRepository);
  const pullRequest = await createOrUpdateProposalPullRequest(pullRequestInput);
  const sourceComment = await maybeUpsertProposalSourceComment(
    input,
    staging.manifest,
    pullRequest.pullRequest,
    "recognition",
  );

  return {
    ok: true,
    mode: "promote-draft",
    inputSource: "approved_draft",
    draftCount: 1,
    proposedEntryCount: 1,
    skippedEntryCount: 0,
    publicOutputsRendered: true,
    approvalStatus: assessment.maintainerApprovalStatus,
    redactionChanged: false,
    redactionMatchCount: 0,
    stagedFileCount: staging.manifest.files.length,
    proposalBranch: branch.branchName,
    proposalCommitSha: branch.commitSha,
    proposalPullRequestNumber: pullRequest.pullRequest.number,
    proposalPullRequestUrl: pullRequest.pullRequest.url,
    proposalPullRequestAction: pullRequest.action,
    ...(sourceComment === undefined
      ? {}
      : {
          sourceCommentAction: sourceComment.action,
          sourceCommentUrl: sourceComment.comment.url,
        }),
  };
}

async function maybeUpsertProposalSourceComment(
  input: Pick<ActionProposeInput, "commentMode" | "sourceCommentClient">,
  manifest: ProposalOutputStagingManifest,
  proposalPullRequest: ProposalPullRequest,
  proposalKind: "recognition" | "draft-review",
): Promise<SourcePullRequestCommentUpsertResult | undefined> {
  if (input.commentMode === undefined || input.commentMode === "none") {
    return undefined;
  }

  return upsertSourcePullRequestComment({
    client: input.sourceCommentClient as SourcePullRequestCommentClient,
    repository: manifest.source.repository,
    pullRequestNumber: manifest.source.pullRequestNumber,
    proposalKind,
    proposalPullRequestNumber: proposalPullRequest.number,
    proposalPullRequestUrl: proposalPullRequest.url,
  });
}

function validateSourceCommentInput(
  input: Pick<ActionProposeInput, "commentMode" | "sourceCommentClient">,
): void {
  if (input.commentMode === "upsert" && input.sourceCommentClient === undefined) {
    throw new ActionUsageError(
      "comment-mode upsert requires a source pull request comment client before repository mutation.",
    );
  }
}

async function readExistingRecognitionRecords(repositoryDir: string): Promise<readonly unknown[]> {
  const ledgerPath = join(repositoryDir, CONTRIBUTIONS_JSONL_PATH);

  try {
    return parseContributionsJsonl(await readFile(ledgerPath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export interface ActionEnvironmentRuntime {
  readonly pullRequestClient?: ProposalPullRequestClient;
  readonly sourceCommentClient?: SourcePullRequestCommentClient;
  readonly liveGitHubClient?: ActionDryRunInput["liveGitHubClient"];
  readonly provider?: ContributionDraftProvider;
  readonly fetch?: typeof fetch;
}

export async function runActionFromEnvironment(
  env: NodeJS.ProcessEnv,
  io: ActionProcessIo,
  runtime: ActionEnvironmentRuntime = {},
): Promise<number> {
  try {
    const explicitEventPath = readEnvInput(env.INPUT_EVENT_PATH);
    const githubFixturePath = readEnvInput(env.INPUT_GITHUB_FIXTURE);
    const modeInput = readEnvInput(env.INPUT_MODE);
    const explicitMode = modeInput === undefined ? undefined : normalizeActionMode(modeInput);
    const fallbackEventPath =
      githubFixturePath === undefined && explicitMode !== "promote-draft"
        ? readEnvInput(env.GITHUB_EVENT_PATH)
        : undefined;
    const summaryJsonPath = await resolveActionSummaryPath(env);

    const config =
      explicitMode === "promote-draft" ? {} : await loadActionConfigFromEnvironment(env);
    const mode = explicitMode ?? normalizeActionMode(config.mode ?? "propose");
    const commentMode = normalizeSourceCommentMode(readEnvInput(env.INPUT_COMMENT_MODE) ?? "none");
    if (commentMode === "upsert" && (mode === "dry-run" || mode === "commit")) {
      throw new ActionUsageError(
        "INPUT_COMMENT_MODE upsert supports only propose, stage-draft, or promote-draft mode.",
      );
    }
    const input: ActionDryRunInput = {
      mode,
      markdownSummary: resolveActionMarkdownSummary(env, config),
      includeAutomationContributors: resolveActionIncludeAutomationContributors(env, config),
    };
    if (mode === "promote-draft") {
      if (explicitEventPath !== undefined || githubFixturePath !== undefined) {
        throw new ActionUsageError(
          "promote-draft accepts draft-path instead of event-path or github-fixture.",
        );
      }
    } else {
      assignOptional(input, "eventPath", explicitEventPath ?? fallbackEventPath);
      assignOptional(input, "githubFixturePath", githubFixturePath);
      assignOptional(input, "liveGitHubClient", runtime.liveGitHubClient);
      assignOptional(
        input,
        "provider",
        runtime.provider ?? resolveActionProvider(env, runtime, config),
      );
    }

    const summary = await runActionMode(input, env, runtime);
    await writeActionSummaryJson(summaryJsonPath, summary);
    await writeGitHubOutputs(env.GITHUB_OUTPUT, summary, summaryJsonPath);
    await writeGitHubStepSummary(env.GITHUB_STEP_SUMMARY, summary);
    io.stdout(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof OpenAiCompatibleProviderError) {
      try {
        await writeGitHubProviderFailureStepSummary(env.GITHUB_STEP_SUMMARY, error);
      } catch {
        io.stderr("Clarissimi could not write the provider failure step summary.\n");
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return error instanceof ActionUsageError ? 1 : 4;
  }
}

async function resolveActionSummaryPath(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const inputPath = readEnvInput(env.INPUT_SUMMARY_PATH);
  if (inputPath === undefined) {
    return undefined;
  }

  if (isAbsolute(inputPath)) {
    throw new ActionUsageError(
      "INPUT_SUMMARY_PATH must be a relative path inside GITHUB_WORKSPACE.",
    );
  }

  const workspace = resolve(readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd());
  const resolvedPath = resolve(workspace, inputPath);
  if (!isPathInside(workspace, resolvedPath)) {
    throw new ActionUsageError("INPUT_SUMMARY_PATH must stay inside GITHUB_WORKSPACE.");
  }

  const workspaceRoot = await realpath(workspace);
  let currentPath = workspaceRoot;
  const relativePath = relative(workspace, resolvedPath);
  for (const segment of relativePath.split(/[\\/]+/).filter((value) => value.length > 0)) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink() || (stats.isFile() && stats.nlink > 1)) {
        throw new ActionUsageError(
          "INPUT_SUMMARY_PATH must not traverse symbolic links, junctions, or hard links.",
        );
      }

      const resolvedCurrentPath = await realpath(currentPath);
      if (!isPathInside(workspaceRoot, resolvedCurrentPath)) {
        throw new ActionUsageError("INPUT_SUMMARY_PATH must stay inside GITHUB_WORKSPACE.");
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return resolvedPath;
}

function isPathInside(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);
  return relativePath.length === 0 || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function runActionMode(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
): Promise<ActionRunSummary> {
  const mode = normalizeActionMode(input.mode ?? "dry-run");

  if (mode === "propose") {
    return runActionPropose(buildActionWriteInput(input, env, runtime, "propose"));
  }

  if (mode === "commit") {
    return runActionCommit(buildActionCommitInput(input, env, runtime));
  }

  if (mode === "stage-draft") {
    return runActionStageDraft(buildActionWriteInput(input, env, runtime, "stage-draft"));
  }

  if (mode === "promote-draft") {
    return runActionPromoteDraft(buildActionWriteInput(input, env, runtime, "promote-draft"));
  }

  return runActionDryRun({
    ...input,
    mode,
  });
}

function buildActionCommitInput(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
): ActionCommitInput {
  requireEnvInput(env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const clientOptions: Parameters<typeof createGitHubApiClient>[0] = {
    token: env.GITHUB_TOKEN as string,
  };
  assignOptional(clientOptions, "apiUrl", readEnvInput(env.GITHUB_API_URL));
  assignOptional(clientOptions, "fetch", runtime.fetch);

  const commitInput: ActionCommitInput = {
    ...input,
    mode: "commit",
    repositoryDir: readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd(),
    stagingDir:
      readEnvInput(env.INPUT_STAGING_DIR) ??
      join(readEnvInput(env.RUNNER_TEMP) ?? tmpdir(), "clarissimi-commit"),
    targetBranch: readEnvInput(env.INPUT_BASE_BRANCH) ?? "main",
    liveGitHubClient: runtime.liveGitHubClient ?? createGitHubApiClient(clientOptions),
  };
  assignOptional(commitInput, "expectedHeadSha", readEnvInput(env.GITHUB_SHA));
  assignOptional(commitInput, "remoteName", readEnvInput(env.INPUT_REMOTE_NAME));
  return commitInput;
}

function normalizeActionMode(value: string): ActionMode {
  if (!isActionMode(value)) {
    throw new ActionUsageError(`Unsupported action mode: ${value}.`);
  }

  return value;
}

function normalizeSourceCommentMode(value: string): SourceCommentMode {
  if (!isSourceCommentMode(value)) {
    throw new ActionUsageError(`Unsupported source comment mode: ${value}.`);
  }

  return value;
}

function buildActionWriteInput(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
  mode: "propose",
): ActionProposeInput;
function buildActionWriteInput(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
  mode: "stage-draft",
): ActionStageDraftInput;
function buildActionWriteInput(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
  mode: "promote-draft",
): ActionPromoteDraftInput;
function buildActionWriteInput(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
  mode: "propose" | "stage-draft" | "promote-draft",
): ActionProposeInput | ActionStageDraftInput | ActionPromoteDraftInput {
  const clientOptions: Parameters<typeof createGitHubPullRequestClient>[0] = {
    token: requireEnvInput(env.GITHUB_TOKEN, "GITHUB_TOKEN"),
  };
  assignOptional(clientOptions, "apiUrl", readEnvInput(env.GITHUB_API_URL));
  assignOptional(clientOptions, "fetch", runtime.fetch);
  const defaultGitHubClient = createGitHubPullRequestClient(clientOptions);
  const pullRequestClient = runtime.pullRequestClient ?? defaultGitHubClient;
  const sourceCommentClient = runtime.sourceCommentClient ?? defaultGitHubClient;
  const commentMode = normalizeSourceCommentMode(readEnvInput(env.INPUT_COMMENT_MODE) ?? "none");

  if (mode === "propose") {
    const liveGitHubClientOptions = buildLiveGitHubClientOptions(clientOptions, runtime);
    const proposeInput: ActionProposeInput = {
      ...input,
      mode,
      repositoryDir: readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd(),
      stagingDir:
        readEnvInput(env.INPUT_STAGING_DIR) ??
        join(readEnvInput(env.RUNNER_TEMP) ?? tmpdir(), "clarissimi-propose"),
      baseBranch: readEnvInput(env.INPUT_BASE_BRANCH) ?? "main",
      pullRequestClient,
      commentMode,
      sourceCommentClient,
      liveGitHubClient: runtime.liveGitHubClient ?? createGitHubApiClient(liveGitHubClientOptions),
    };
    assignOptional(proposeInput, "remoteName", readEnvInput(env.INPUT_REMOTE_NAME));
    assignOptional(proposeInput, "targetRepository", readEnvInput(env.GITHUB_REPOSITORY));

    return proposeInput;
  }

  if (mode === "promote-draft") {
    const promoteDraftInput: ActionPromoteDraftInput = {
      mode,
      draftPath: resolvePromoteDraftPath(env),
      repositoryDir: readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd(),
      stagingDir:
        readEnvInput(env.INPUT_STAGING_DIR) ??
        join(readEnvInput(env.RUNNER_TEMP) ?? tmpdir(), "clarissimi-promote-draft"),
      baseBranch: readEnvInput(env.INPUT_BASE_BRANCH) ?? "main",
      pullRequestClient,
      commentMode,
      sourceCommentClient,
    };
    assignOptional(promoteDraftInput, "remoteName", readEnvInput(env.INPUT_REMOTE_NAME));
    assignOptional(promoteDraftInput, "targetRepository", readEnvInput(env.GITHUB_REPOSITORY));
    assignOptional(promoteDraftInput, "markdownSummary", input.markdownSummary);
    assignOptional(
      promoteDraftInput,
      "includeAutomationContributors",
      input.includeAutomationContributors,
    );

    return promoteDraftInput;
  }

  const liveGitHubClientOptions = buildLiveGitHubClientOptions(clientOptions, runtime);

  const stageDraftInput: ActionStageDraftInput = {
    ...input,
    mode,
    repositoryDir: readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd(),
    stagingDir:
      readEnvInput(env.INPUT_STAGING_DIR) ??
      join(readEnvInput(env.RUNNER_TEMP) ?? tmpdir(), "clarissimi-stage-draft"),
    baseBranch: readEnvInput(env.INPUT_BASE_BRANCH) ?? "main",
    pullRequestClient,
    commentMode,
    sourceCommentClient,
    liveGitHubClient: runtime.liveGitHubClient ?? createGitHubApiClient(liveGitHubClientOptions),
  };
  assignOptional(stageDraftInput, "remoteName", readEnvInput(env.INPUT_REMOTE_NAME));
  assignOptional(stageDraftInput, "targetRepository", readEnvInput(env.GITHUB_REPOSITORY));

  return stageDraftInput;
}

function buildLiveGitHubClientOptions(
  clientOptions: Parameters<typeof createGitHubPullRequestClient>[0],
  runtime: ActionEnvironmentRuntime,
): Parameters<typeof createGitHubApiClient>[0] {
  const options: Parameters<typeof createGitHubApiClient>[0] = {
    token: clientOptions.token,
  };
  assignOptional(options, "apiUrl", clientOptions.apiUrl);
  assignOptional(options, "fetch", runtime.fetch);
  return options;
}

function resolvePromoteDraftPath(env: NodeJS.ProcessEnv): string {
  const inputPath = readEnvInput(env.INPUT_DRAFT_PATH);
  if (inputPath === undefined) {
    throw new ActionUsageError("INPUT_DRAFT_PATH is required for promote-draft mode.");
  }

  if (isAbsolute(inputPath)) {
    throw new ActionUsageError("INPUT_DRAFT_PATH must be relative to GITHUB_WORKSPACE.");
  }

  const workspace = resolve(readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd());
  const draftsRoot = resolve(workspace, ".clarissimi", "drafts");
  const resolvedPath = resolve(workspace, inputPath);
  if (!isPathInside(draftsRoot, resolvedPath) || resolvedPath === draftsRoot) {
    throw new ActionUsageError("INPUT_DRAFT_PATH must point inside .clarissimi/drafts/.");
  }

  if (!resolvedPath.toLowerCase().endsWith(".json")) {
    throw new ActionUsageError("INPUT_DRAFT_PATH must point to a JSON draft file.");
  }

  return resolvedPath;
}

async function readApprovedDraft(
  path: string,
  repositoryDir: string,
): Promise<ContributionAssessment> {
  let realDraftPath: string;
  let realDraftsRoot: string;
  let realRepositoryDir: string;
  try {
    [realDraftPath, realDraftsRoot, realRepositoryDir] = await Promise.all([
      realpath(path),
      realpath(join(repositoryDir, ".clarissimi", "drafts")),
      realpath(repositoryDir),
    ]);
  } catch {
    throw new Error("Unable to resolve the approved Clarissimi draft path.");
  }

  if (
    !isPathInside(realRepositoryDir, realDraftsRoot) ||
    !isPathInside(realDraftsRoot, realDraftPath) ||
    realDraftPath === realDraftsRoot
  ) {
    throw new Error("Approved Clarissimi draft resolves outside .clarissimi/drafts/.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(realDraftPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Approved Clarissimi draft contains invalid JSON.");
    }

    throw new Error("Unable to read the approved Clarissimi draft.");
  }

  const result = validateContributionAssessment(parsed);
  if (!result.ok) {
    const issue = result.issues[0];
    throw new Error(
      issue === undefined
        ? "Approved Clarissimi draft is invalid."
        : `Approved Clarissimi draft is invalid at ${issue.path}: ${issue.message}`,
    );
  }

  if (
    result.value.maintainerApprovalStatus !== "approved" &&
    result.value.maintainerApprovalStatus !== "auto_approved"
  ) {
    throw new Error("promote-draft requires maintainerApprovalStatus approved or auto_approved.");
  }

  return result.value;
}

type PreparedActionAssessment =
  | {
      readonly kind: "skipped";
      readonly inputSource: ActionInputSource;
      readonly reason: string;
    }
  | {
      readonly kind: "assessment";
      readonly inputSource: ActionInputSource;
      readonly assessment: ContributionAssessment;
      readonly redactionChanged: boolean;
      readonly redactionMatchCount: number;
    };

async function prepareActionAssessment(
  input: ActionDryRunInput,
): Promise<PreparedActionAssessment> {
  const source = selectInputSource(input);
  const eventPayload = JSON.parse(await readFile(source.path, "utf8")) as unknown;
  const resolution =
    source.kind === "github_fixture"
      ? {
          kind: "merged_pull_request" as const,
          fixture: parseGitHubMergedPullRequestFixture(eventPayload),
        }
      : resolveGitHubEventPayload(eventPayload);

  if (resolution.kind === "skipped") {
    return {
      kind: "skipped",
      inputSource: source.kind,
      reason: resolution.reason,
    };
  }

  const collected =
    source.kind === "github_event_path" && input.liveGitHubClient !== undefined
      ? await collectLiveMergedPullRequestEvidence({
          client: input.liveGitHubClient,
          repository: resolution.fixture.repository.fullName,
          pullRequestNumber: resolution.fixture.pullRequest.number,
        })
      : collectMergedPullRequestEvidence(resolution.fixture);
  const preparedEvidence = prepareEvidenceForProvider(collected.evidence);
  const provider = input.provider ?? createFakeContributionDraftProvider();
  const draft = await provider.createAssessment({
    contributor: collected.contributor,
    preparedEvidence,
  });

  return {
    kind: "assessment",
    inputSource: source.kind,
    assessment: applyFixtureApproval(draft, parseFixtureApprovalStatus(eventPayload)),
    redactionChanged: preparedEvidence.redactionReport.changed,
    redactionMatchCount: preparedEvidence.redactionReport.occurrences.length,
  };
}

function selectInputSource(input: ActionDryRunInput): {
  readonly kind: ActionInputSource;
  readonly path: string;
} {
  if (input.eventPath !== undefined && input.githubFixturePath !== undefined) {
    throw new ActionUsageError("Use only one action input source: eventPath or githubFixturePath.");
  }

  if (input.githubFixturePath !== undefined) {
    return {
      kind: "github_fixture",
      path: input.githubFixturePath,
    };
  }

  if (input.eventPath !== undefined) {
    return {
      kind: "github_event_path",
      path: input.eventPath,
    };
  }

  throw new ActionUsageError(
    "The action skeleton requires GITHUB_EVENT_PATH or INPUT_GITHUB_FIXTURE.",
  );
}

function parseFixtureApprovalStatus(value: unknown): ApprovalStatus | undefined {
  if (!isRecord(value) || value.maintainerApprovalStatus === undefined) {
    return undefined;
  }

  if (
    typeof value.maintainerApprovalStatus !== "string" ||
    !isApprovalStatus(value.maintainerApprovalStatus)
  ) {
    throw new ActionUsageError("maintainerApprovalStatus must be a known approval status.");
  }

  return value.maintainerApprovalStatus;
}

function applyFixtureApproval(
  draft: ContributionAssessment,
  status: ApprovalStatus | undefined,
): ContributionAssessment {
  if (status === undefined || status === "draft") {
    return draft;
  }

  return {
    ...draft,
    maintainerApprovalStatus: status,
  };
}

function readEnvInput(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function requireEnvInput(value: string | undefined, name: string): string {
  const normalized = readEnvInput(value);
  if (normalized === undefined) {
    throw new ActionUsageError(`${name} is required for write modes.`);
  }

  return normalized;
}

function requireProviderEnvInput(value: string | undefined, name: string): string {
  const normalized = readEnvInput(value);
  if (normalized === undefined) {
    throw new ActionUsageError(`${name} is required for the openai-compatible provider.`);
  }

  return normalized;
}

async function loadActionConfigFromEnvironment(env: NodeJS.ProcessEnv): Promise<ClarissimiConfig> {
  const configPath = readEnvInput(env.INPUT_CONFIG_PATH);
  if (configPath === undefined) {
    return {};
  }

  const workspace = readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd();
  const resolvedPath = isAbsolute(configPath) ? configPath : join(workspace, configPath);
  const parsed = await loadActionConfigValue(configPath, resolvedPath);
  const result = validateClarissimiConfig(parsed);
  if (!result.ok) {
    throw new ActionUsageError(formatActionConfigValidationIssue(result.issues[0]));
  }

  return result.value;
}

async function loadActionConfigValue(configPath: string, resolvedPath: string): Promise<unknown> {
  if (resolvedPath.endsWith(".json")) {
    try {
      return JSON.parse(await readFile(resolvedPath, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ActionUsageError(`Invalid JSON in Action config ${configPath}.`);
      }

      throw new ActionUsageError(`Unable to read Action config ${configPath}.`);
    }
  }

  if (basename(configPath.replaceAll("\\", "/")) === "clarissimi.config.ts") {
    let module;
    try {
      module = await import(pathToFileURL(resolvedPath).href);
    } catch {
      throw new ActionUsageError(`Failed to load TypeScript Action config ${configPath}.`);
    }

    if (!("default" in module)) {
      throw new ActionUsageError(
        `TypeScript Action config ${configPath} must export a default config object.`,
      );
    }

    return module.default;
  }

  throw new ActionUsageError(
    "Action config-path must point to a JSON config file or clarissimi.config.ts.",
  );
}

function formatActionConfigValidationIssue(issue: ValidationIssue | undefined): string {
  if (issue === undefined) {
    return "Action config is invalid.";
  }

  if (issue.path === "$" && issue.code === "expected_object") {
    return "Action config must be an object.";
  }

  const field = issue.path.startsWith("$.") ? issue.path.slice(2) : issue.path;
  if (issue.code === "invalid_enum") {
    return `Action config field ${field} has an unsupported value.`;
  }

  if (issue.code === "empty_string") {
    return `Action config field ${field} must be a non-empty string.`;
  }

  return issue.message;
}

function resolveActionProvider(
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime,
  config: ClarissimiConfig,
): ContributionDraftProvider {
  const providerId = readEnvInput(env.INPUT_PROVIDER) ?? config.provider ?? "fake";
  if (!isConfigProvider(providerId)) {
    throw new ActionUsageError(`Unsupported provider: ${providerId}.`);
  }

  if (providerId === "fake") {
    return createFakeContributionDraftProvider();
  }

  if (providerId === "openai-compatible") {
    const options: Parameters<typeof createOpenAiCompatibleContributionDraftProvider>[0] = {
      model: requireProviderEnvInput(
        readEnvInput(env.INPUT_PROVIDER_MODEL) ?? config.providerModel,
        "INPUT_PROVIDER_MODEL or config providerModel",
      ),
      token: requireProviderEnvInput(env.CLARISSIMI_PROVIDER_TOKEN, "CLARISSIMI_PROVIDER_TOKEN"),
    };
    assignOptional(
      options,
      "endpoint",
      readEnvInput(env.INPUT_PROVIDER_ENDPOINT) ?? config.providerEndpoint,
    );
    assignOptional(
      options,
      "endpointTrust",
      parseProviderEndpointTrust(
        readEnvInput(env.INPUT_PROVIDER_ENDPOINT_TRUST) ?? config.providerEndpointTrust,
      ),
    );
    assignOptional(
      options,
      "thinking",
      parseProviderThinking(readEnvInput(env.INPUT_PROVIDER_THINKING) ?? config.providerThinking),
    );
    assignOptional(options, "fetch", runtime.fetch);
    return createOpenAiCompatibleContributionDraftProvider(options);
  }

  throw new ActionUsageError(`Unsupported provider: ${providerId}.`);
}

function parseProviderThinking(value: string | undefined): ConfigProviderThinking | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isConfigProviderThinking(value)) {
    throw new ActionUsageError("INPUT_PROVIDER_THINKING supports only disabled.");
  }

  return value;
}

function parseProviderEndpointTrust(
  value: string | undefined,
): ConfigProviderEndpointTrust | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isConfigProviderEndpointTrust(value)) {
    throw new ActionUsageError(
      "INPUT_PROVIDER_ENDPOINT_TRUST supports only public or private-network.",
    );
  }

  return value;
}

function resolveActionMarkdownSummary(
  env: NodeJS.ProcessEnv,
  config: ClarissimiConfig,
): NonNullable<ClarissimiConfig["markdownSummary"]> {
  const value = readEnvInput(env.INPUT_MARKDOWN_SUMMARY) ?? config.markdownSummary ?? "none";
  if (!isConfigMarkdownSummary(value)) {
    throw new ActionUsageError("INPUT_MARKDOWN_SUMMARY supports only none, table, or gallery.");
  }

  return value;
}

function resolveActionIncludeAutomationContributors(
  env: NodeJS.ProcessEnv,
  config: ClarissimiConfig,
): boolean {
  const value = readEnvInput(env.INPUT_INCLUDE_AUTOMATION_CONTRIBUTORS);
  if (value === undefined) {
    return config.includeAutomationContributors ?? true;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ActionUsageError("INPUT_INCLUDE_AUTOMATION_CONTRIBUTORS supports only true or false.");
}

async function writeGitHubOutputs(
  outputPath: string | undefined,
  summary: ActionRunSummary,
  summaryJsonPath: string | undefined,
): Promise<void> {
  if (outputPath === undefined || outputPath.trim().length === 0) {
    return;
  }

  const lines = [
    `draft-count=${summary.draftCount}`,
    `proposed-entry-count=${summary.proposedEntryCount}`,
    `skipped-entry-count=${summary.skippedEntryCount}`,
    `mode=${summary.mode}`,
    `input-source=${summary.inputSource}`,
    `approval-status=${summary.approvalStatus ?? ""}`,
    `redaction-match-count=${summary.redactionMatchCount}`,
  ];
  if (summaryJsonPath !== undefined) {
    lines.push(`summary-json-path=${summaryJsonPath}`);
  }

  if (
    summary.mode === "propose" ||
    summary.mode === "stage-draft" ||
    summary.mode === "promote-draft"
  ) {
    lines.push(
      `staged-file-count=${summary.stagedFileCount}`,
      `proposal-branch=${summary.proposalBranch}`,
      `proposal-commit-sha=${summary.proposalCommitSha}`,
      `proposal-pull-request-number=${summary.proposalPullRequestNumber}`,
      `proposal-pull-request-url=${summary.proposalPullRequestUrl}`,
      `proposal-pull-request-action=${summary.proposalPullRequestAction}`,
      `source-comment-action=${summary.sourceCommentAction ?? ""}`,
      `source-comment-url=${summary.sourceCommentUrl ?? ""}`,
    );
  }

  if (summary.mode === "commit") {
    lines.push(
      `staged-file-count=${summary.stagedFileCount}`,
      `direct-commit-branch=${summary.directCommitBranch}`,
      `direct-commit-base-sha=${summary.directCommitBaseSha}`,
      `direct-commit-sha=${summary.directCommitSha}`,
      `direct-commit-created=${summary.directCommitCreated}`,
      `direct-commit-pushed=${summary.directCommitPushed}`,
    );
  }

  await appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function writeActionSummaryJson(
  summaryJsonPath: string | undefined,
  summary: ActionRunSummary,
): Promise<void> {
  if (summaryJsonPath === undefined) {
    return;
  }

  await mkdir(dirname(summaryJsonPath), { recursive: true });
  await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function writeGitHubStepSummary(
  summaryPath: string | undefined,
  summary: ActionRunSummary,
): Promise<void> {
  if (summaryPath === undefined || summaryPath.trim().length === 0) {
    return;
  }

  const rows = [
    ["Mode", summary.mode],
    ["Input source", summary.inputSource],
    ["Drafts", String(summary.draftCount)],
    ["Proposed entries", String(summary.proposedEntryCount)],
    ["Skipped entries", String(summary.skippedEntryCount)],
    ["Approval status", summary.approvalStatus ?? "none"],
    ["Redaction matches", String(summary.redactionMatchCount)],
  ];

  if (
    summary.mode === "propose" ||
    summary.mode === "stage-draft" ||
    summary.mode === "promote-draft"
  ) {
    rows.push(
      ["Staged files", String(summary.stagedFileCount)],
      ["Proposal branch", summary.proposalBranch],
      ["Proposal pull request", summary.proposalPullRequestUrl],
      ["Proposal PR action", summary.proposalPullRequestAction],
    );
    if (summary.sourceCommentAction !== undefined && summary.sourceCommentUrl !== undefined) {
      rows.push(
        ["Source comment action", summary.sourceCommentAction],
        ["Source comment", summary.sourceCommentUrl],
      );
    }
  }

  if (summary.mode === "commit") {
    rows.push(
      ["Staged files", String(summary.stagedFileCount)],
      ["Target branch", summary.directCommitBranch],
      ["Commit SHA", summary.directCommitSha],
      ["Commit created", String(summary.directCommitCreated)],
      ["Commit pushed", String(summary.directCommitPushed)],
    );
  }

  if (summary.mode === "dry-run" && summary.skippedReason !== undefined) {
    rows.push(["Skipped reason", summary.skippedReason]);
  }

  const markdown = [
    `## Clarissimi ${summary.mode} summary`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(
      ([field, value]) =>
        `| ${escapeMarkdownTableCell(field)} | ${escapeMarkdownTableCell(value)} |`,
    ),
    "",
  ].join("\n");

  await appendFile(summaryPath, markdown, "utf8");
}

const MAX_PROVIDER_FAILURE_ISSUES = 8;
const MAX_PROVIDER_FAILURE_FIELD_LENGTH = 120;

async function writeGitHubProviderFailureStepSummary(
  summaryPath: string | undefined,
  error: OpenAiCompatibleProviderError,
): Promise<void> {
  if (
    summaryPath === undefined ||
    summaryPath.trim().length === 0 ||
    error.code !== "invalid_assessment" ||
    error.issues === undefined ||
    error.issues.length === 0
  ) {
    return;
  }

  const issues = error.issues.slice(0, MAX_PROVIDER_FAILURE_ISSUES);
  const markdown = [
    "## Clarissimi provider result rejected",
    "",
    "The provider output failed Clarissimi's result-quality contract. Raw provider content is intentionally omitted.",
    "",
    "| Rule | Path |",
    "| --- | --- |",
    ...issues.map(
      (issue) =>
        `| ${escapeMarkdownTableCell(boundedProviderFailureField(issue.code))} | ${escapeMarkdownTableCell(boundedProviderFailureField(issue.path))} |`,
    ),
    ...(error.issues.length > issues.length
      ? [`| additional_issues_omitted | ${error.issues.length - issues.length} |`]
      : []),
    "",
  ].join("\n");

  await appendFile(summaryPath, markdown, "utf8");
}

function boundedProviderFailureField(value: string): string {
  const normalized = value.replaceAll("\r", " ").replaceAll("\n", " ").trim();
  if (normalized.length <= MAX_PROVIDER_FAILURE_FIELD_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_PROVIDER_FAILURE_FIELD_LENGTH - 1)}…`;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
