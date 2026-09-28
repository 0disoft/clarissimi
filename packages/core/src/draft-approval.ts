import { createHash } from "node:crypto";

import type { ContributionAssessment, DraftApprovalSnapshot } from "@clarissimi/schemas";

export function createDraftApprovalSnapshot(
  assessment: ContributionAssessment,
  recordedAt: string,
): DraftApprovalSnapshot {
  return {
    contentSha256: draftContentSha256(assessment),
    recordedAt,
  };
}

export type DraftApprovalSnapshotCheck = "valid" | "missing" | "mismatch" | "not_required";

export function checkDraftApprovalSnapshot(
  assessment: ContributionAssessment,
): DraftApprovalSnapshotCheck {
  if (assessment.maintainerApprovalStatus !== "approved") {
    return "not_required";
  }
  if (assessment.approvalSnapshot === undefined) {
    return "missing";
  }
  return assessment.approvalSnapshot.contentSha256 === draftContentSha256(assessment)
    ? "valid"
    : "mismatch";
}

export function matchesDraftApprovalSnapshot(assessment: ContributionAssessment): boolean {
  return checkDraftApprovalSnapshot(assessment) !== "mismatch";
}

function draftContentSha256(assessment: ContributionAssessment): string {
  const content: Record<string, unknown> = { ...assessment };
  delete content.maintainerApprovalStatus;
  delete content.approvalSnapshot;
  return createHash("sha256")
    .update(JSON.stringify(sortJsonValue(content)))
    .digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, sortJsonValue(item)]),
    );
  }
  return value;
}
