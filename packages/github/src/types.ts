import type { EvidenceBundleInput } from "@clarissimi/core";
import type { ContributorIdentity, ContributorKind, EvidenceRef } from "@clarissimi/schemas";

export interface GitHubRepositoryFixture {
  readonly fullName: string;
}

export interface GitHubActorFixture {
  readonly id: number | string;
  readonly login: string;
  readonly htmlUrl?: string;
  readonly kind?: ContributorKind;
}

export interface GitHubLabelFixture {
  readonly name: string;
}

export interface GitHubChangedFileFixture {
  readonly filename: string;
  readonly status?: string;
  readonly additions?: number;
  readonly deletions?: number;
  readonly patchExcerpt?: string;
}

export interface GitHubMergedPullRequestFixture {
  readonly repository: GitHubRepositoryFixture;
  readonly pullRequest: {
    readonly number: number;
    readonly title: string;
    readonly body?: string;
    readonly htmlUrl?: string;
    readonly mergedAt?: string;
    readonly user: GitHubActorFixture;
    readonly labels?: readonly GitHubLabelFixture[];
    readonly changedFiles?: readonly GitHubChangedFileFixture[];
    readonly mergeCommitSha?: string;
  };
}

export interface CollectedGitHubEvidence {
  readonly contributor: ContributorIdentity;
  readonly evidence: EvidenceBundleInput;
  readonly collectionCoverage?: GitHubCollectionCoverage;
  readonly contributorCandidates?: readonly GitHubContributorCandidate[];
}

export interface GitHubCollectionCoverage {
  readonly changedFilesCollected: number;
  readonly changedFilesOmittedAtLeast: number;
  readonly reviewCommentsMayBeOmitted: boolean;
  readonly linkedIssuesOmitted: boolean;
  readonly candidateReviewsMayBeOmitted?: boolean;
  readonly candidateIssuesMayBeOmitted?: boolean;
  readonly candidateIssueLookupsUnavailable?: number;
}

export interface GitHubContributorCandidate {
  readonly contributor: ContributorIdentity;
  readonly roles: readonly ("reviewer" | "issue_reporter")[];
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly requiresMaintainerReview: true;
}
