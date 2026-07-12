import type { ConfigMarkdownSummary, ContributionAssessment } from "@clarissimi/schemas";
import type { LiveGitHubClient } from "@clarissimi/github";
import type { ContributionDraftProvider } from "@clarissimi/providers";
import type { ProposalPullRequestClient } from "./pull-request.js";

export const ACTION_MODES = [
  "dry-run",
  "propose",
  "commit",
  "stage-draft",
  "promote-draft",
] as const;

export type ActionMode = (typeof ACTION_MODES)[number];

export function isActionMode(value: string): value is ActionMode {
  return (ACTION_MODES as readonly string[]).includes(value);
}

export type ActionInputSource = "github_event_path" | "github_fixture" | "approved_draft";

export interface ActionDryRunInput {
  readonly mode?: ActionMode | string;
  readonly eventPath?: string;
  readonly githubFixturePath?: string;
  readonly liveGitHubClient?: LiveGitHubClient;
  readonly provider?: ContributionDraftProvider;
  readonly markdownSummary?: ConfigMarkdownSummary;
}

export interface ActionProposeInput extends ActionDryRunInput {
  readonly mode: "propose";
  readonly repositoryDir: string;
  readonly stagingDir: string;
  readonly baseBranch: string;
  readonly remoteName?: string;
  readonly targetRepository?: string;
  readonly pullRequestClient: ProposalPullRequestClient;
}

export interface ActionCommitInput extends ActionDryRunInput {
  readonly mode: "commit";
  readonly repositoryDir: string;
  readonly stagingDir: string;
  readonly targetBranch: string;
  readonly expectedHeadSha?: string;
  readonly remoteName?: string;
}

export interface ActionStageDraftInput extends Omit<ActionProposeInput, "mode"> {
  readonly mode: "stage-draft";
}

export interface ActionPromoteDraftInput extends Omit<
  ActionProposeInput,
  "eventPath" | "githubFixturePath" | "liveGitHubClient" | "mode" | "provider"
> {
  readonly mode: "promote-draft";
  readonly draftPath: string;
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
  readonly mode: "propose" | "stage-draft" | "promote-draft";
  readonly inputSource: ActionInputSource;
  readonly draftCount: 1;
  readonly proposedEntryCount: 0 | 1;
  readonly skippedEntryCount: 0;
  readonly publicOutputsRendered: boolean;
  readonly approvalStatus: ContributionAssessment["maintainerApprovalStatus"];
  readonly redactionChanged: boolean;
  readonly redactionMatchCount: number;
  readonly stagedFileCount: number;
  readonly proposalBranch: string;
  readonly proposalCommitSha: string;
  readonly proposalPullRequestNumber: number;
  readonly proposalPullRequestUrl: string;
  readonly proposalPullRequestAction: "created" | "updated";
}

export interface ActionCommitSummary {
  readonly ok: true;
  readonly mode: "commit";
  readonly inputSource: ActionInputSource;
  readonly draftCount: 1;
  readonly proposedEntryCount: 1;
  readonly skippedEntryCount: 0;
  readonly publicOutputsRendered: true;
  readonly approvalStatus: "approved" | "auto_approved";
  readonly redactionChanged: boolean;
  readonly redactionMatchCount: number;
  readonly stagedFileCount: number;
  readonly directCommitBranch: string;
  readonly directCommitBaseSha: string;
  readonly directCommitSha: string;
  readonly directCommitCreated: boolean;
  readonly directCommitPushed: boolean;
}

export type ActionRunSummary = ActionDryRunSummary | ActionProposeSummary | ActionCommitSummary;

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
