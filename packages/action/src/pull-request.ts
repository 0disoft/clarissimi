import type { ProposalBranchWriteResult } from "./branch-writer.js";
import type { ProposalOutputStagingManifest } from "./staging.js";

const RECOGNITION_TITLE_PREFIX = "Clarissimi recognition:" as const;
const DRAFT_TITLE_PREFIX = "Clarissimi draft review:" as const;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_FILES = 25;
const MAX_BODY_LINE_LENGTH = 180;

export interface ProposalPullRequestCreatorInput {
  readonly client: ProposalPullRequestClient;
  readonly manifest: ProposalOutputStagingManifest;
  readonly branch: ProposalBranchWriteResult;
  readonly targetRepository?: string;
  readonly maintainerApprovalNote?: string;
}

export interface ProposalPullRequestClient {
  findOpenPullRequest(
    input: ProposalPullRequestLookupInput,
  ): Promise<ProposalPullRequest | null>;
  createPullRequest(
    input: ProposalPullRequestCreateInput,
  ): Promise<ProposalPullRequest>;
  updatePullRequest(
    input: ProposalPullRequestUpdateInput,
  ): Promise<ProposalPullRequest>;
}

export interface ProposalPullRequestLookupInput {
  readonly repository: string;
  readonly headBranch: string;
  readonly baseBranch: string;
}

export interface ProposalPullRequestCreateInput extends ProposalPullRequestLookupInput {
  readonly title: string;
  readonly body: string;
}

export interface ProposalPullRequestUpdateInput {
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

export interface ProposalPullRequest {
  readonly number: number;
  readonly url: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly title: string;
}

export interface ProposalPullRequestCreatorResult {
  readonly action: "created" | "updated";
  readonly pullRequest: ProposalPullRequest;
  readonly title: string;
  readonly body: string;
}

export type ProposalPullRequestClientErrorCode =
  | "permission_denied"
  | "repository_setting_blocked"
  | "not_found"
  | "unexpected";

export class ProposalPullRequestClientError extends Error {
  readonly code: ProposalPullRequestClientErrorCode;

  constructor(code: ProposalPullRequestClientErrorCode, message: string) {
    super(message);
    this.name = "ProposalPullRequestClientError";
    this.code = code;
  }
}

export class ProposalPullRequestCreatorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProposalPullRequestCreatorError";
    this.code = code;
  }
}

export async function createOrUpdateProposalPullRequest(
  input: ProposalPullRequestCreatorInput,
): Promise<ProposalPullRequestCreatorResult> {
  validatePullRequestCreatorInput(input);

  const title = buildProposalPullRequestTitle(input.manifest);
  const body = buildProposalPullRequestBody(input);
  const targetRepository =
    input.targetRepository ?? input.manifest.source.repository;
  const lookup = {
    repository: targetRepository,
    headBranch: input.branch.branchName,
    baseBranch: input.branch.baseBranch,
  };

  try {
    const existing = await input.client.findOpenPullRequest(lookup);

    if (existing === null) {
      const pullRequest = await input.client.createPullRequest({
        ...lookup,
        title,
        body,
      });
      return {
        action: "created",
        pullRequest,
        title,
        body,
      };
    }

    const pullRequest = await input.client.updatePullRequest({
      repository: targetRepository,
      number: existing.number,
      title,
      body,
    });

    return {
      action: "updated",
      pullRequest,
      title,
      body,
    };
  } catch (error) {
    throw translatePullRequestClientError(error);
  }
}

export function buildProposalPullRequestTitle(
  manifest: ProposalOutputStagingManifest,
): string {
  const prefix =
    manifest.mode === "stage-draft"
      ? DRAFT_TITLE_PREFIX
      : RECOGNITION_TITLE_PREFIX;
  return truncateLine(
    `${prefix} ${manifest.source.repository}#${manifest.source.pullRequestNumber}`,
    MAX_TITLE_LENGTH,
  );
}

export function buildProposalPullRequestBody(
  input: Omit<ProposalPullRequestCreatorInput, "client">,
): string {
  const source = input.manifest.source;
  const changedFiles = boundedList(input.branch.changedFiles);
  const stagedFiles = boundedList(
    input.manifest.files.map((file) => file.path),
  );
  const approvalNote =
    normalizeBodyLine(input.maintainerApprovalNote) ??
    "Maintainers own final approval. Review, edit, or close this pull request according to repository policy.";
  const isDraftReview = input.manifest.mode === "stage-draft";

  return [
    isDraftReview
      ? "## Clarissimi draft review proposal"
      : "## Clarissimi recognition proposal",
    "",
    "### Source",
    "",
    `- Repository: ${safeInline(source.repository)}`,
    `- Event: ${safeInline(source.event)}`,
    `- Pull request: #${source.pullRequestNumber}`,
    ...(source.mergedAt === undefined
      ? []
      : [`- Merged at: ${safeInline(source.mergedAt)}`]),
    "",
    isDraftReview ? "### Staged draft files" : "### Generated files",
    "",
    ...stagedFiles,
    "",
    "### Branch changes",
    "",
    `- Branch: ${safeInline(input.branch.branchName)}`,
    `- Base branch: ${safeInline(input.branch.baseBranch)}`,
    `- Commit: ${safeInline(input.branch.commitSha)}`,
    ...changedFiles,
    "",
    isDraftReview ? "### Draft review summary" : "### Approval summary",
    "",
    `- Assessments: ${input.manifest.assessmentCount}`,
    `- Approved: ${input.manifest.approvalSummary.approved}`,
    `- Auto-approved: ${input.manifest.approvalSummary.autoApproved}`,
    ...(isDraftReview ? ["- Drafts staged: 1"] : []),
    `- Redaction matches: ${input.manifest.redactionMatchCount}`,
    "",
    "### Maintainer approval",
    "",
    approvalNote,
    "",
    "### Rollback",
    "",
    safeInline(input.branch.rollbackHint),
    "",
  ].join("\n");
}

function validatePullRequestCreatorInput(
  input: ProposalPullRequestCreatorInput,
): void {
  if (input.manifest.source.repository.trim().length === 0) {
    throw new ProposalPullRequestCreatorError(
      "missing_repository",
      "Proposal pull request creation requires a source repository.",
    );
  }

  if (
    input.targetRepository !== undefined &&
    input.targetRepository.trim().length === 0
  ) {
    throw new ProposalPullRequestCreatorError(
      "missing_target_repository",
      "Proposal pull request creation requires a non-empty target repository when provided.",
    );
  }

  if (input.branch.branchName.trim().length === 0) {
    throw new ProposalPullRequestCreatorError(
      "missing_branch",
      "Proposal pull request creation requires a proposal branch name.",
    );
  }

  if (input.branch.baseBranch.trim().length === 0) {
    throw new ProposalPullRequestCreatorError(
      "missing_base_branch",
      "Proposal pull request creation requires a base branch.",
    );
  }

  if (
    input.branch.changedFiles.length === 0 ||
    input.manifest.files.length === 0
  ) {
    throw new ProposalPullRequestCreatorError(
      "missing_changed_files",
      "Proposal pull request creation requires generated file changes.",
    );
  }
}

function translatePullRequestClientError(error: unknown): Error {
  if (error instanceof ProposalPullRequestCreatorError) {
    return error;
  }

  if (error instanceof ProposalPullRequestClientError) {
    if (error.code === "permission_denied") {
      return new ProposalPullRequestCreatorError(
        "pull_request_permission_denied",
        "Clarissimi could not create or update the proposal pull request. Check that the workflow has pull-requests: write and that the token can access the target repository.",
      );
    }

    if (error.code === "repository_setting_blocked") {
      return new ProposalPullRequestCreatorError(
        "pull_request_repository_setting_blocked",
        "Clarissimi could not create the proposal pull request because repository or organization settings block workflow-created pull requests. Enable workflow pull request creation or create the pull request manually from the proposal branch.",
      );
    }

    if (error.code === "not_found") {
      return new ProposalPullRequestCreatorError(
        "pull_request_target_not_found",
        "Clarissimi could not find the target repository for the proposal pull request. Check GITHUB_REPOSITORY, the repository URL, and token access before rerunning propose mode.",
      );
    }

    return new ProposalPullRequestCreatorError(
      "pull_request_client_failed",
      error.message,
    );
  }

  if (error instanceof Error) {
    return new ProposalPullRequestCreatorError(
      "pull_request_client_failed",
      error.message,
    );
  }

  return new ProposalPullRequestCreatorError(
    "pull_request_client_failed",
    String(error),
  );
}

function boundedList(values: readonly string[]): readonly string[] {
  const lines = values
    .slice(0, MAX_BODY_FILES)
    .map((value) => `- \`${safeCode(value)}\``);
  const remaining = values.length - MAX_BODY_FILES;

  if (remaining > 0) {
    return [...lines, `- ${remaining} more file(s) omitted from this summary.`];
  }

  return lines;
}

function safeInline(value: string): string {
  return truncateLine(value.replace(/\s+/g, " ").trim(), MAX_BODY_LINE_LENGTH);
}

function safeCode(value: string): string {
  return safeInline(value).replaceAll("`", "");
}

function normalizeBodyLine(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = safeInline(value);
  return normalized.length > 0 ? normalized : undefined;
}

function truncateLine(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
