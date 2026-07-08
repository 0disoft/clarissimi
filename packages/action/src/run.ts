import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import {
  collectMergedPullRequestEvidence,
  collectLiveMergedPullRequestEvidence,
  createGitHubApiClient,
  parseGitHubMergedPullRequestFixture
} from "@clarissimi/github";
import { createFakeContributionDraftProvider } from "@clarissimi/providers";
import {
  isApprovalStatus,
  type ApprovalStatus,
  type ContributionAssessment
} from "@clarissimi/schemas";

import { publishProposalBranch } from "./branch-publisher.js";
import { writeProposalBranch } from "./branch-writer.js";
import { resolveGitHubEventPayload } from "./event.js";
import { createGitHubPullRequestClient } from "./github-client.js";
import { createOrUpdateProposalPullRequest, type ProposalPullRequestClient } from "./pull-request.js";
import { stageProposalRecognitionOutputs } from "./staging.js";
import { sanitizeAssessmentForActionSummary } from "./summary.js";
import type {
  ActionDryRunInput,
  ActionDryRunSummary,
  ActionInputSource,
  ActionProposeInput,
  ActionProposeSummary,
  ActionProcessIo
} from "./types.js";

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
      skippedReason: prepared.reason
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
    assessment: sanitizeAssessmentForActionSummary(prepared.assessment)
  };
}

export async function runActionPropose(input: ActionProposeInput): Promise<ActionProposeSummary> {
  const prepared = await prepareActionAssessment(input);
  if (prepared.kind === "skipped") {
    throw new ActionUsageError("Propose mode requires a merged pull request input.");
  }

  const staging = await stageProposalRecognitionOutputs({
    outputDir: input.stagingDir,
    assessments: [prepared.assessment],
    redactionMatchCount: prepared.redactionMatchCount
  });
  const branch = await writeProposalBranch({
    repositoryDir: input.repositoryDir,
    stagedOutputDir: input.stagingDir,
    manifest: staging.manifest,
    baseBranch: input.baseBranch
  });
  const publishInput: Parameters<typeof publishProposalBranch>[0] = {
    repositoryDir: input.repositoryDir,
    branch
  };
  assignOptional(publishInput, "remoteName", input.remoteName);
  await publishProposalBranch(publishInput);
  const pullRequest = await createOrUpdateProposalPullRequest({
    client: input.pullRequestClient,
    manifest: staging.manifest,
    branch
  });

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
    proposalPullRequestAction: pullRequest.action
  };
}

export interface ActionEnvironmentRuntime {
  readonly pullRequestClient?: ProposalPullRequestClient;
  readonly liveGitHubClient?: ActionDryRunInput["liveGitHubClient"];
  readonly fetch?: typeof fetch;
}

export async function runActionFromEnvironment(
  env: NodeJS.ProcessEnv,
  io: ActionProcessIo,
  runtime: ActionEnvironmentRuntime = {}
): Promise<number> {
  try {
    const explicitEventPath = readEnvInput(env.INPUT_EVENT_PATH);
    const githubFixturePath = readEnvInput(env.INPUT_GITHUB_FIXTURE);
    const fallbackEventPath = githubFixturePath === undefined
      ? readEnvInput(env.GITHUB_EVENT_PATH)
      : undefined;
    const input: ActionDryRunInput = {
      mode: readEnvInput(env.INPUT_MODE) ?? "dry-run"
    };
    assignOptional(input, "eventPath", explicitEventPath ?? fallbackEventPath);
    assignOptional(input, "githubFixturePath", githubFixturePath);
    assignOptional(input, "liveGitHubClient", runtime.liveGitHubClient);

    const summary = input.mode === "propose"
      ? await runActionPropose(buildActionProposeInput(input, env, runtime))
      : await runActionDryRun(input);
    await writeGitHubOutputs(env.GITHUB_OUTPUT, summary);
    await writeGitHubStepSummary(env.GITHUB_STEP_SUMMARY, summary);
    io.stdout(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return error instanceof ActionUsageError ? 1 : 4;
  }
}

function buildActionProposeInput(
  input: ActionDryRunInput,
  env: NodeJS.ProcessEnv,
  runtime: ActionEnvironmentRuntime
): ActionProposeInput {
  const clientOptions: Parameters<typeof createGitHubPullRequestClient>[0] = {
    token: requireEnvInput(env.GITHUB_TOKEN, "GITHUB_TOKEN")
  };
  assignOptional(clientOptions, "apiUrl", readEnvInput(env.GITHUB_API_URL));
  assignOptional(clientOptions, "fetch", runtime.fetch);

  const liveGitHubClientOptions: Parameters<typeof createGitHubApiClient>[0] = {
    token: clientOptions.token
  };
  assignOptional(liveGitHubClientOptions, "apiUrl", clientOptions.apiUrl);
  assignOptional(liveGitHubClientOptions, "fetch", runtime.fetch);

  const proposeInput: ActionProposeInput = {
    ...input,
    mode: "propose" as const,
    repositoryDir: readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd(),
    stagingDir: readEnvInput(env.INPUT_STAGING_DIR)
      ?? join(readEnvInput(env.RUNNER_TEMP) ?? tmpdir(), "clarissimi-propose"),
    baseBranch: readEnvInput(env.INPUT_BASE_BRANCH) ?? "main",
    pullRequestClient: runtime.pullRequestClient ?? createGitHubPullRequestClient(clientOptions),
    liveGitHubClient: runtime.liveGitHubClient ?? createGitHubApiClient(liveGitHubClientOptions)
  };
  assignOptional(proposeInput, "remoteName", readEnvInput(env.INPUT_REMOTE_NAME));

  return proposeInput;
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

async function prepareActionAssessment(input: ActionDryRunInput): Promise<PreparedActionAssessment> {
  const source = selectInputSource(input);
  const eventPayload = JSON.parse(await readFile(source.path, "utf8")) as unknown;
  const resolution = source.kind === "github_fixture"
    ? {
        kind: "merged_pull_request" as const,
        fixture: parseGitHubMergedPullRequestFixture(eventPayload)
      }
    : resolveGitHubEventPayload(eventPayload);

  if (resolution.kind === "skipped") {
    return {
      kind: "skipped",
      inputSource: source.kind,
      reason: resolution.reason
    };
  }

  const collected = source.kind === "github_event_path" && input.liveGitHubClient !== undefined
    ? await collectLiveMergedPullRequestEvidence({
        client: input.liveGitHubClient,
        repository: resolution.fixture.repository.fullName,
        pullRequestNumber: resolution.fixture.pullRequest.number
      })
    : collectMergedPullRequestEvidence(resolution.fixture);
  const preparedEvidence = prepareEvidenceForProvider(collected.evidence);
  const provider = createFakeContributionDraftProvider();
  const draft = await provider.createAssessment({
    contributor: collected.contributor,
    preparedEvidence
  });

  return {
    kind: "assessment",
    inputSource: source.kind,
    assessment: applyFixtureApproval(draft, parseFixtureApprovalStatus(eventPayload)),
    redactionChanged: preparedEvidence.redactionReport.changed,
    redactionMatchCount: preparedEvidence.redactionReport.occurrences.length
  };
}

function selectInputSource(input: ActionDryRunInput): {
  readonly kind: ActionInputSource;
  readonly path: string;
} {
  if (input.eventPath !== undefined && input.githubFixturePath !== undefined) {
    throw new ActionUsageError(
      "Use only one action input source: eventPath or githubFixturePath."
    );
  }

  if (input.githubFixturePath !== undefined) {
    return {
      kind: "github_fixture",
      path: input.githubFixturePath
    };
  }

  if (input.eventPath !== undefined) {
    return {
      kind: "github_event_path",
      path: input.eventPath
    };
  }

  throw new ActionUsageError("The action skeleton requires GITHUB_EVENT_PATH or INPUT_GITHUB_FIXTURE.");
}

function parseFixtureApprovalStatus(value: unknown): ApprovalStatus | undefined {
  if (!isRecord(value) || value.maintainerApprovalStatus === undefined) {
    return undefined;
  }

  if (typeof value.maintainerApprovalStatus !== "string" || !isApprovalStatus(value.maintainerApprovalStatus)) {
    throw new ActionUsageError("maintainerApprovalStatus must be a known approval status.");
  }

  return value.maintainerApprovalStatus;
}

function applyFixtureApproval(
  draft: ContributionAssessment,
  status: ApprovalStatus | undefined
): ContributionAssessment {
  if (status === undefined || status === "draft") {
    return draft;
  }

  return {
    ...draft,
    maintainerApprovalStatus: status
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
    throw new ActionUsageError(`${name} is required for propose mode.`);
  }

  return normalized;
}

async function writeGitHubOutputs(
  outputPath: string | undefined,
  summary: ActionDryRunSummary | ActionProposeSummary
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
    `redaction-match-count=${summary.redactionMatchCount}`
  ];

  if (summary.mode === "propose") {
    lines.push(
      `staged-file-count=${summary.stagedFileCount}`,
      `proposal-branch=${summary.proposalBranch}`,
      `proposal-commit-sha=${summary.proposalCommitSha}`,
      `proposal-pull-request-number=${summary.proposalPullRequestNumber}`,
      `proposal-pull-request-url=${summary.proposalPullRequestUrl}`,
      `proposal-pull-request-action=${summary.proposalPullRequestAction}`
    );
  }

  await appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function writeGitHubStepSummary(
  summaryPath: string | undefined,
  summary: ActionDryRunSummary | ActionProposeSummary
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
    ["Redaction matches", String(summary.redactionMatchCount)]
  ];

  if (summary.mode === "propose") {
    rows.push(
      ["Staged files", String(summary.stagedFileCount)],
      ["Proposal branch", summary.proposalBranch],
      ["Proposal pull request", summary.proposalPullRequestUrl],
      ["Proposal PR action", summary.proposalPullRequestAction]
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
        `| ${escapeMarkdownTableCell(field)} | ${escapeMarkdownTableCell(value)} |`
    ),
    ""
  ].join("\n");

  await appendFile(summaryPath, markdown, "utf8");
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
  value: T[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
