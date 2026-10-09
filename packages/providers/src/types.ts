import type { PreparedProviderEvidence } from "@clarissimi/core";
import type {
  ContributionAssessment,
  ContributionAssessmentHints,
  ContributorIdentity,
} from "@clarissimi/schemas";

export interface ContributionDraftProvider {
  readonly id: string;
  createAssessment(input: ProviderAssessmentInput): Promise<ContributionAssessment>;
}

export interface ProviderAssessmentInput {
  readonly contributor: ContributorIdentity;
  readonly preparedEvidence: PreparedProviderEvidence;
  readonly hints?: ProviderAssessmentHints;
}

export type ProviderAssessmentHints = ContributionAssessmentHints;
