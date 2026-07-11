import type { PreparedProviderEvidence } from "@clarissimi/core";
import type {
  ContributionAssessment,
  ContributionType,
  ContributorIdentity,
  ImpactLevel,
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

export interface ProviderAssessmentHints {
  readonly contributionType?: ContributionType;
  readonly affectedArea?: string;
  readonly impactLevel?: ImpactLevel;
  readonly suggestedBadge?: string;
  readonly confidence?: number;
}
