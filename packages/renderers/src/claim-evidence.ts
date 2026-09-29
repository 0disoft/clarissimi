import type { ContributionAssessment } from "@clarissimi/schemas";

export function copyClaimEvidenceLinks(
  assessment: ContributionAssessment,
): Pick<ContributionAssessment, "claimEvidenceLinks"> {
  return assessment.claimEvidenceLinks === undefined
    ? {}
    : {
        claimEvidenceLinks: assessment.claimEvidenceLinks.map((link) => ({
          field: link.field,
          text: link.text,
          evidenceRefIndexes: [...link.evidenceRefIndexes],
        })),
      };
}
