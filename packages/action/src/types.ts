import type { ContributionAssessment } from "@clarissimi/schemas";
import type { LiveGitHubClient } from "@clarissimi/github";
import type { ProposalPullRequestClient } from "./pull-request.js";

export type ActionMode = "dry-run" | "propose";

export type ActionInputSource = "github_event_path" | "github_fixture";

export interface ActionDryRunInput {
  readonly mode?: ActionMode | string;
  readonly eventPath?: string;
  readonly githubFixturePath?: string;
  readonly liveGitHubClient?: LiveGitHubClient;
}

export interface ActionProposeInput extends ActionDryRunInput {
  readonly mode: "propose";
  readonly repositoryDir: string;
  readonly stagingDir: string;
  readonly baseBranch: string;
  readonly remoteName?: string;
  readonly pullRequestClient: ProposalPullRequestClient;
}

export interface ActionDryRunSummary {
  readonly ok: true;
  readonly mode: "dry-run";
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

export interface ActionProposeSummary {
  readonly ok: true;
  readonly mode: "propose";
  readonly inputSource: ActionInputSource;
  readonly draftCount: 1;
  readonly proposedEntryCount: 1;
  readonly skippedEntryCount: 0;
  readonly publicOutputsRendered: true;
  readonly approvalStatus: "approved" | "auto_approved";
  readonly redactionChanged: boolean;
  readonly redactionMatchCount: number;
  readonly stagedFileCount: number;
  readonly proposalBranch: string;
  readonly proposalCommitSha: string;
  readonly proposalPullRequestNumber: number;
  readonly proposalPullRequestUrl: string;
  readonly proposalPullRequestAction: "created" | "updated";
}

export type ActionRunSummary = ActionDryRunSummary | ActionProposeSummary;

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
