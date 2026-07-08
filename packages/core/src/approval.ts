import {
  validateContributionAssessment,
  type ContributionAssessment,
  type ValidationIssue,
  type ValidationResult
} from "@clarissimi/schemas";

export interface PublishableAssessment {
  readonly assessment: ContributionAssessment;
}

export type PublishableAssessmentResult =
  | {
      readonly ok: true;
      readonly value: PublishableAssessment;
      readonly issues: readonly [];
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
    };

export function canPublishAssessment(value: unknown): PublishableAssessmentResult {
  const validation = validateContributionAssessment(value);

  if (!validation.ok) {
    return validation;
  }

  if (!isPublicApprovalStatus(validation.value.maintainerApprovalStatus)) {
    return {
      ok: false,
      issues: [
        {
          path: "$.maintainerApprovalStatus",
          code: "not_approved",
          message: "Only approved or auto_approved assessments can become public records."
        }
      ]
    };
  }

  return {
    ok: true,
    value: {
      assessment: validation.value
    },
    issues: []
  };
}

export function requireValidAssessment(
  value: unknown
): ValidationResult<ContributionAssessment> {
  return validateContributionAssessment(value);
}

function isPublicApprovalStatus(status: ContributionAssessment["maintainerApprovalStatus"]): boolean {
  return status === "approved" || status === "auto_approved";
}
