import type { ContributionAssessment } from "@clarissimi/schemas";

import type { SanitizedContributionAssessment } from "./types.js";

export function sanitizeAssessmentForActionSummary(
  assessment: ContributionAssessment
): SanitizedContributionAssessment {
  return {
    ...assessment,
    evidenceRefs: assessment.evidenceRefs.map((ref) => {
      const sanitized: SanitizedContributionAssessment["evidenceRefs"][number] = {
        kind: ref.kind,
        id: ref.id
      };

      assignOptional(sanitized, "url", ref.url);
      assignOptional(sanitized, "title", ref.title);
      return sanitized;
    })
  };
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
