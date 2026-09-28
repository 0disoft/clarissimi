import { readFile } from "node:fs/promises";

import {
  isReviewGateMode,
  validateReviewDecision,
  type ReviewDecision,
  type ReviewGateMode,
} from "@clarissimi/schemas";

import type { SourcePullRequestComment, SourcePullRequestCommentClient } from "./source-comment.js";

const REVIEW_DECISION_MARKER = "<!-- clarissimi:review-decision:v1";
const REVIEW_DECISION_END = "-->";
const MAX_REVIEW_COMMENT_LENGTH = 4_096;
const MAX_REVIEW_PERMISSION_LOOKUPS = 16;
const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export interface ActionReviewGateInput {
  readonly eventPath: string;
  readonly gateMode: ReviewGateMode;
  readonly commentClient: SourcePullRequestCommentClient;
}

export interface ActionReviewGateSummary {
  readonly ok: true;
  readonly mode: "gate";
  readonly inputSource: "github_event_path";
  readonly draftCount: 0;
  readonly proposedEntryCount: 0;
  readonly skippedEntryCount: 0;
  readonly publicOutputsRendered: false;
  readonly approvalStatus: null;
  readonly redactionChanged: false;
  readonly redactionMatchCount: 0;
  readonly gateMode: ReviewGateMode;
  readonly gatePassed: boolean;
  readonly gateDecision: ReviewDecision["decision"] | null;
  readonly gateReason: string;
}

export class ReviewGateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewGateError";
    this.code = code;
  }
}

export function isActionReviewGateMode(value: string): value is ReviewGateMode {
  return isReviewGateMode(value);
}

export async function runActionReviewGate(
  input: ActionReviewGateInput,
): Promise<ActionReviewGateSummary> {
  const event = parsePullRequestEvent(
    JSON.parse(await readFile(input.eventPath, "utf8")) as unknown,
  );
  const listed = await input.commentClient.listPullRequestComments({
    repository: event.repository,
    pullRequestNumber: event.pullRequestNumber,
  });
  if (!listed.complete) {
    return finishGate(
      input.gateMode,
      null,
      "Clarissimi could not complete the bounded review comment scan.",
    );
  }

  const marked = listed.comments.filter((comment) =>
    comment.body.startsWith(REVIEW_DECISION_MARKER),
  );
  const candidates = marked.filter(isTrustedMaintainerComment);
  const parsed = candidates.flatMap((comment) => {
    const decision = parseDecisionComment(comment);
    return decision === undefined ? [] : [{ comment, decision }];
  });
  const matchingSource = parsed.filter(
    ({ decision }) =>
      decision.repository.toLowerCase() === event.repository.toLowerCase() &&
      decision.pullRequestNumber === event.pullRequestNumber,
  );
  const currentCandidates = matchingSource.filter(
    ({ decision }) => decision.headSha.toLowerCase() === event.headSha.toLowerCase(),
  );
  if (currentCandidates.length > MAX_REVIEW_PERMISSION_LOOKUPS) {
    return finishGate(
      input.gateMode,
      null,
      "Too many review decisions target the current PR head SHA.",
    );
  }
  const permissions = new Map<string, boolean>();
  const current: ReviewDecision[] = [];
  for (const { comment, decision } of currentCandidates) {
    const login = comment.authorLogin.toLowerCase();
    let canApprove = permissions.get(login);
    if (canApprove === undefined) {
      const lookupPermission = input.commentClient.getRepositoryPermission;
      if (lookupPermission === undefined) {
        return finishGate(
          input.gateMode,
          null,
          "Clarissimi cannot verify current maintainer permissions.",
        );
      }
      let permission: string;
      try {
        permission = await lookupPermission.call(input.commentClient, {
          repository: event.repository,
          username: comment.authorLogin,
        });
      } catch {
        return finishGate(
          input.gateMode,
          null,
          "Clarissimi could not verify current maintainer permissions.",
        );
      }
      canApprove = permission === "admin" || permission === "write";
      permissions.set(login, canApprove);
    }
    if (canApprove) {
      current.push(decision);
    }
  }

  if (current.length > 1) {
    return finishGate(
      input.gateMode,
      null,
      "More than one trusted decision targets the current PR head SHA.",
    );
  }
  if (current[0] !== undefined) {
    return finishGate(
      input.gateMode,
      current[0],
      `Maintainer decision ${current[0].decision} matches the current PR head SHA.`,
    );
  }
  if (currentCandidates.length > current.length || marked.length > candidates.length) {
    return finishGate(
      input.gateMode,
      null,
      "Review decision markers from authors without current maintainer access were ignored.",
    );
  }
  if (matchingSource.length > 0) {
    return finishGate(
      input.gateMode,
      null,
      "The maintainer decision is stale because the PR head SHA changed.",
    );
  }
  if (candidates.length > parsed.length) {
    return finishGate(input.gateMode, null, "A trusted review decision comment is malformed.");
  }
  return finishGate(
    input.gateMode,
    null,
    "No trusted maintainer review decision exists for the current PR head SHA.",
  );
}

function finishGate(
  gateMode: ReviewGateMode,
  decision: ReviewDecision | null,
  reason: string,
): ActionReviewGateSummary {
  const gatePassed = decision !== null;
  if (!gatePassed && gateMode === "required") {
    throw new ReviewGateError("review_decision_required", reason);
  }

  return {
    ok: true,
    mode: "gate",
    inputSource: "github_event_path",
    draftCount: 0,
    proposedEntryCount: 0,
    skippedEntryCount: 0,
    publicOutputsRendered: false,
    approvalStatus: null,
    redactionChanged: false,
    redactionMatchCount: 0,
    gateMode,
    gatePassed,
    gateDecision: decision?.decision ?? null,
    gateReason: reason,
  };
}

function parseDecisionComment(comment: SourcePullRequestComment): ReviewDecision | undefined {
  if (comment.body.length > MAX_REVIEW_COMMENT_LENGTH) {
    return undefined;
  }
  const end = comment.body.indexOf(REVIEW_DECISION_END, REVIEW_DECISION_MARKER.length);
  if (end < 0) {
    return undefined;
  }
  const payload = comment.body.slice(REVIEW_DECISION_MARKER.length, end).trim();
  try {
    const result = validateReviewDecision(JSON.parse(payload) as unknown);
    return result.ok ? result.value : undefined;
  } catch {
    return undefined;
  }
}

function isTrustedMaintainerComment(comment: SourcePullRequestComment): boolean {
  return (
    comment.authorType === "User" &&
    TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation ?? "")
  );
}

function parsePullRequestEvent(value: unknown): {
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
} {
  if (!isRecord(value) || !isRecord(value.repository) || !isRecord(value.pull_request)) {
    throw new ReviewGateError(
      "invalid_event",
      "Review gate requires a GitHub pull request event payload.",
    );
  }
  const head = value.pull_request.head;
  const repository = value.repository.full_name;
  const pullRequestNumber = value.pull_request.number;
  if (
    !isRecord(head) ||
    typeof repository !== "string" ||
    !/^[^/\s]+\/[^/\s]+$/.test(repository) ||
    typeof pullRequestNumber !== "number" ||
    !Number.isInteger(pullRequestNumber) ||
    pullRequestNumber <= 0 ||
    typeof head.sha !== "string" ||
    !/^[a-f0-9]{40}$/i.test(head.sha)
  ) {
    throw new ReviewGateError(
      "invalid_event",
      "Review gate pull request event fields are invalid.",
    );
  }
  return { repository, pullRequestNumber, headSha: head.sha };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
