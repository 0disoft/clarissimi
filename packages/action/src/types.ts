import type { ContributionAssessment } from "@clarissimi/schemas";

export type ActionMode = "dry-run";

export type ActionInputSource = "github_event_path" | "github_fixture";

export interface ActionDryRunInput {
  readonly mode?: ActionMode | string;
  readonly eventPath?: string;
  readonly githubFixturePath?: string;
}

export interface ActionDryRunSummary {
  readonly ok: true;
  readonly mode: ActionMode;
  readonly inputSource: ActionInputSource;
  readonly draftCount: number;
  readonly proposedEntryCount: 0;
  readonly skippedEntryCount: number;
  readonly publicOutputsRendered: false;
  readonly approvalStatus: ContributionAssessment["maintainerApprovalStatus"] | null;
  readonly redactionChanged: boolean;
  readonly redactionMatchCount: number;
  readonly assessment?: SanitizedContributionAssessment;
  readonly skippedReason?: string;
}

export type SanitizedContributionAssessment = Omit<ContributionAssessment, "evidenceRefs"> & {
  readonly evidenceRefs: readonly SanitizedEvidenceRef[];
};

export interface SanitizedEvidenceRef {
  readonly kind: ContributionAssessment["evidenceRefs"][number]["kind"];
  readonly id: string;
  readonly url?: string;
  readonly title?: string;
}

export interface ActionProcessIo {
  stdout(value: string): void;
  stderr(value: string): void;
}
