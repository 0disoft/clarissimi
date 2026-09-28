import { toDraftReviewRecord, toPublicContributionRecord } from "@clarissimi/renderers";
import type { ContributionAssessment } from "@clarissimi/schemas";

import type { SanitizedContributionAssessment } from "./types.js";

export function sanitizeAssessmentForActionSummary(
  assessment: ContributionAssessment,
): SanitizedContributionAssessment {
  return assessment.maintainerApprovalStatus === "draft"
    ? toDraftReviewRecord(assessment)
    : toPublicContributionRecord(assessment);
}
