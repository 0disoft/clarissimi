import { validateContributionAssessment } from "@clarissimi/schemas";
import type { ContributionAssessment } from "@clarissimi/schemas";

import {
  DRAFTS_DIR_PATH,
  RendererValidationError,
  type DraftReviewRecord,
} from "./types.js";
import { renderPrettyJson } from "./ledger.js";

export function toDraftReviewRecord(value: unknown): DraftReviewRecord {
  const result = validateContributionAssessment(value);

  if (!result.ok) {
    throw new RendererValidationError(
      "Draft is not a valid contribution assessment.",
      result.issues,
    );
  }

  if (result.value.maintainerApprovalStatus !== "draft") {
    throw new RendererValidationError(
      "Only draft assessments can be staged for maintainer review.",
      [
        {
          path: "$.maintainerApprovalStatus",
          code: "invalid_stage_status",
          message: "Staged drafts must use maintainerApprovalStatus: draft.",
        },
      ],
    );
  }

  return sanitizeDraftReviewRecord(result.value);
}

export function renderDraftReviewJson(value: unknown): string {
  return renderPrettyJson(toDraftReviewRecord(value));
}

export function draftReviewPathForAssessment(value: unknown): string {
  const record = toDraftReviewRecord(value);
  return `${DRAFTS_DIR_PATH}/${draftReviewFilename(record)}`;
}

export function draftReviewFilename(
  assessment: ContributionAssessment,
): string {
  const repository = sanitizePathPart(assessment.source.repository);
  const event = sanitizePathPart(assessment.source.event);

  return `${repository}-${event}-${assessment.source.pullRequestNumber}.json`;
}

function sanitizeDraftReviewRecord(
  assessment: ContributionAssessment,
): DraftReviewRecord {
  return {
    schemaVersion: assessment.schemaVersion,
    contributor: {
      platform: assessment.contributor.platform,
      id: assessment.contributor.id,
      login: assessment.contributor.login,
      profileUrl: assessment.contributor.profileUrl,
    },
    contributionType: assessment.contributionType,
    affectedArea: assessment.affectedArea,
    impactLevel: assessment.impactLevel,
    evidenceSummary: assessment.evidenceSummary,
    evidenceRefs: assessment.evidenceRefs.map((ref) => ({
      kind: ref.kind,
      id: ref.id,
      ...(ref.url === undefined ? {} : { url: ref.url }),
      ...(ref.title === undefined ? {} : { title: ref.title }),
    })),
    suggestedBadge: assessment.suggestedBadge,
    publicRecognitionText: assessment.publicRecognitionText,
    confidence: assessment.confidence,
    maintainerApprovalStatus: assessment.maintainerApprovalStatus,
    source: {
      repository: assessment.source.repository,
      event: assessment.source.event,
      pullRequestNumber: assessment.source.pullRequestNumber,
      ...(assessment.source.mergedAt === undefined
        ? {}
        : { mergedAt: assessment.source.mergedAt }),
    },
  };
}

function sanitizePathPart(value: string): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length === 0 ? "unknown" : normalized;
}
