const SOURCE_COMMENT_MARKER = "<!-- clarissimi:source-status:v1 -->";
const GITHUB_ACTIONS_BOT_LOGIN = "github-actions[bot]";
const GITHUB_ACTIONS_APP_SLUG = "github-actions";
const MAX_COMMENT_BODY_LENGTH = 4_096;

export const SOURCE_COMMENT_MODES = ["none", "upsert"] as const;

export type SourceCommentMode = (typeof SOURCE_COMMENT_MODES)[number];

export interface SourcePullRequestCommentClient {
  listPullRequestComments(
    input: SourcePullRequestCommentLookupInput,
  ): Promise<SourcePullRequestCommentListResult>;
  createPullRequestComment(
    input: SourcePullRequestCommentCreateInput,
  ): Promise<SourcePullRequestComment>;
  updatePullRequestComment(
    input: SourcePullRequestCommentUpdateInput,
  ): Promise<SourcePullRequestComment>;
  deletePullRequestComment(input: SourcePullRequestCommentDeleteInput): Promise<void>;
}

export interface SourcePullRequestCommentLookupInput {
  readonly repository: string;
  readonly pullRequestNumber: number;
}

export interface SourcePullRequestCommentCreateInput extends SourcePullRequestCommentLookupInput {
  readonly body: string;
}

export interface SourcePullRequestCommentUpdateInput {
  readonly repository: string;
  readonly commentId: number;
  readonly body: string;
}

export interface SourcePullRequestCommentDeleteInput extends SourcePullRequestCommentLookupInput {
  readonly commentId: number;
}

export interface SourcePullRequestComment {
  readonly id: number;
  readonly url: string;
  readonly body: string;
  readonly authorLogin: string;
  readonly authorType: string;
  readonly appSlug?: string;
}

export interface SourcePullRequestCommentListResult {
  readonly comments: readonly SourcePullRequestComment[];
  readonly complete: boolean;
}

export interface SourcePullRequestCommentUpsertInput extends SourcePullRequestCommentLookupInput {
  readonly client: SourcePullRequestCommentClient;
  readonly proposalKind: "recognition" | "draft-review";
  readonly proposalPullRequestNumber: number;
  readonly proposalPullRequestUrl: string;
}

export interface SourcePullRequestCommentUpsertResult {
  readonly action: "created" | "updated" | "unchanged";
  readonly comment: SourcePullRequestComment;
  readonly body: string;
}

export class SourcePullRequestCommentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SourcePullRequestCommentError";
    this.code = code;
  }
}

export function isSourceCommentMode(value: string): value is SourceCommentMode {
  return (SOURCE_COMMENT_MODES as readonly string[]).includes(value);
}

export async function upsertSourcePullRequestComment(
  input: SourcePullRequestCommentUpsertInput,
): Promise<SourcePullRequestCommentUpsertResult> {
  validateUpsertInput(input);
  const body = buildSourcePullRequestCommentBody(input);
  const listed = await input.client.listPullRequestComments({
    repository: input.repository,
    pullRequestNumber: input.pullRequestNumber,
  });

  if (!listed.complete) {
    throw new SourcePullRequestCommentError(
      "comment_scan_incomplete",
      "Clarissimi stopped before creating a source pull request comment because the bounded comment scan did not reach the end.",
    );
  }

  const managed = listed.comments.filter(isManagedSourceComment);
  if (managed.length > 1) {
    throw new SourcePullRequestCommentError(
      "multiple_managed_comments",
      "Clarissimi found more than one managed source pull request comment and will not choose one to overwrite.",
    );
  }

  const existing = managed[0];
  if (existing === undefined) {
    const created = await input.client.createPullRequestComment({
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
      body,
    });
    return await reconcileCreatedSourceComment(input, created, body);
  }

  if (existing.body === body) {
    return { action: "unchanged", comment: existing, body };
  }

  const comment = await input.client.updatePullRequestComment({
    repository: input.repository,
    commentId: existing.id,
    body,
  });
  return { action: "updated", comment, body };
}

async function reconcileCreatedSourceComment(
  input: SourcePullRequestCommentUpsertInput,
  created: SourcePullRequestComment,
  body: string,
): Promise<SourcePullRequestCommentUpsertResult> {
  const listed = await input.client.listPullRequestComments({
    repository: input.repository,
    pullRequestNumber: input.pullRequestNumber,
  });

  if (!listed.complete) {
    await deleteCreatedComment(input, created.id);
    throw new SourcePullRequestCommentError(
      "comment_scan_incomplete_after_create",
      "Clarissimi removed the comment it just created because the bounded reconciliation scan did not reach the end.",
    );
  }

  const managed = listed.comments.filter(isManagedSourceComment);
  if (managed.length === 0 || !managed.some((comment) => comment.id === created.id)) {
    await deleteCreatedComment(input, created.id);
    throw new SourcePullRequestCommentError(
      "created_comment_not_visible",
      "Clarissimi removed the comment it just created because the reconciliation scan could not prove that exact managed comment was visible.",
    );
  }

  if (managed.some((comment) => comment.body !== body)) {
    await deleteCreatedComment(input, created.id);
    throw new SourcePullRequestCommentError(
      "concurrent_managed_comment_conflict",
      "Clarissimi removed the comment it just created because a concurrent managed comment had different content.",
    );
  }

  const survivor = managed.reduce((current, comment) =>
    comment.id < current.id ? comment : current,
  );
  for (const duplicate of managed) {
    if (duplicate.id === survivor.id) {
      continue;
    }
    await input.client.deletePullRequestComment({
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
      commentId: duplicate.id,
    });
  }

  if (managed.length > 1) {
    const confirmed = await input.client.listPullRequestComments({
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
    });
    const remaining = confirmed.comments.filter(isManagedSourceComment);
    if (
      !confirmed.complete ||
      remaining.length !== 1 ||
      remaining[0]?.id !== survivor.id ||
      remaining[0].body !== body
    ) {
      throw new SourcePullRequestCommentError(
        "comment_reconciliation_failed",
        "Clarissimi could not prove that concurrent source comment creation converged to one managed comment.",
      );
    }
    return {
      action: survivor.id === created.id ? "created" : "unchanged",
      comment: remaining[0],
      body,
    };
  }

  return { action: "created", comment: survivor, body };
}

async function deleteCreatedComment(
  input: SourcePullRequestCommentUpsertInput,
  commentId: number,
): Promise<void> {
  await input.client.deletePullRequestComment({
    repository: input.repository,
    pullRequestNumber: input.pullRequestNumber,
    commentId,
  });
}

export function buildSourcePullRequestCommentBody(
  input: Omit<SourcePullRequestCommentUpsertInput, "client">,
): string {
  const proposalUrl = normalizeProposalUrl(input.proposalPullRequestUrl);
  const summary =
    input.proposalKind === "draft-review"
      ? "An unapproved Clarissimi draft is ready for maintainer review."
      : "A Clarissimi recognition proposal is ready for maintainer review.";

  const body = [
    SOURCE_COMMENT_MARKER,
    "## Clarissimi status",
    "",
    summary,
    "",
    `- Proposal: [#${input.proposalPullRequestNumber}](${proposalUrl})`,
    "",
    "Maintainers own the final approval and merge decision.",
    "",
  ].join("\n");

  if (body.length > MAX_COMMENT_BODY_LENGTH) {
    throw new SourcePullRequestCommentError(
      "comment_body_too_large",
      `Clarissimi source pull request comment exceeded ${MAX_COMMENT_BODY_LENGTH} characters.`,
    );
  }

  return body;
}

function isManagedSourceComment(comment: SourcePullRequestComment): boolean {
  return (
    comment.body.includes(SOURCE_COMMENT_MARKER) &&
    comment.authorLogin === GITHUB_ACTIONS_BOT_LOGIN &&
    comment.authorType === "Bot" &&
    comment.appSlug === GITHUB_ACTIONS_APP_SLUG
  );
}

function validateUpsertInput(input: SourcePullRequestCommentUpsertInput): void {
  if (!/^[^/\s]+\/[^/\s]+$/.test(input.repository)) {
    throw new SourcePullRequestCommentError(
      "invalid_repository",
      "Clarissimi source pull request comments require an owner/name repository.",
    );
  }

  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
    throw new SourcePullRequestCommentError(
      "invalid_pull_request_number",
      "Clarissimi source pull request comments require a positive pull request number.",
    );
  }

  if (!Number.isInteger(input.proposalPullRequestNumber) || input.proposalPullRequestNumber <= 0) {
    throw new SourcePullRequestCommentError(
      "invalid_proposal_pull_request_number",
      "Clarissimi source pull request comments require a positive proposal pull request number.",
    );
  }
}

function normalizeProposalUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SourcePullRequestCommentError(
      "invalid_proposal_url",
      "Clarissimi source pull request comments require an absolute proposal URL.",
    );
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new SourcePullRequestCommentError(
      "invalid_proposal_url",
      "Clarissimi source pull request comments require a credential-free HTTP(S) proposal URL.",
    );
  }

  return parsed.href.replaceAll("(", "%28").replaceAll(")", "%29");
}
