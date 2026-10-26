import {
  prepareEvidenceExcerpt,
  prepareEvidenceForProvider,
  type EvidenceItemInput,
} from "@clarissimi/core";
import {
  validateContributorIdentity,
  type ContributorIdentity,
  type EvidenceRef,
} from "@clarissimi/schemas";

import type {
  LiveGitHubActor,
  LiveGitHubClient,
  LiveGitHubPullRequestLookup,
  LiveGitHubReviewComment,
} from "./live.js";
import { collectGitHubContributor } from "./merged-pr.js";
import type { GitHubContributorCandidate } from "./types.js";

const REVIEW_LIMIT = 25;
const ISSUE_LIMIT = 10;

interface CandidateInput {
  readonly client: LiveGitHubClient;
  readonly lookup: LiveGitHubPullRequestLookup;
  readonly author: ContributorIdentity;
  readonly reviewComments: readonly LiveGitHubReviewComment[];
  readonly linkedIssues: readonly EvidenceItemInput[];
}

export async function discoverContributorCandidates(input: CandidateInput) {
  type MutableCandidate = {
    contributor: ContributorIdentity;
    roles: GitHubContributorCandidate["roles"][number][];
    evidenceRefs: EvidenceRef[];
    requiresMaintainerReview: true;
  };
  const candidates = new Map<string, MutableCandidate>();
  const evidenceItems: EvidenceItemInput[] = [];
  const prUrl = `https://github.com/${input.lookup.repository}/pull/${input.lookup.pullRequestNumber}`;
  const source = { ...input.lookup, event: "merged_pull_request" as const };
  const add = (
    actor: LiveGitHubActor | null | undefined,
    role: GitHubContributorCandidate["roles"][number],
    ref: EvidenceRef,
  ) => {
    if (actor === undefined || actor === null || String(actor.id) === input.author.id) return;
    const identity = collectGitHubContributor({
      id: actor.id,
      login: actor.login,
      ...(actor.htmlUrl == null ? {} : { htmlUrl: actor.htmlUrl }),
      ...(actor.kind === undefined ? {} : { kind: actor.kind }),
    });
    if (!validateContributorIdentity(identity).ok) return;
    // Reuse core policy before exposing any actor-controlled fields in candidate output.
    const safe = prepareEvidenceForProvider({
      source,
      items: [
        { kind: ref.kind, id: identity.id, url: identity.profileUrl, title: identity.login },
        ref,
      ],
    });
    if (safe.redactionReport.changed) return;
    const candidate = candidates.get(identity.id) ?? {
      contributor: identity,
      roles: [],
      evidenceRefs: [],
      requiresMaintainerReview: true as const,
    };
    candidate.contributor = identity;
    if (!candidate.roles.includes(role)) candidate.roles.push(role);
    if (
      !candidate.evidenceRefs.some(
        (existing) => existing.kind === ref.kind && existing.id === ref.id,
      )
    )
      candidate.evidenceRefs.push(ref);
    candidates.set(identity.id, candidate);
  };

  for (const comment of input.reviewComments) {
    add(comment.user, "reviewer", {
      kind: "review",
      id: `review-comment:${comment.id}`,
      url: `${prUrl}#discussion_r${encodeURIComponent(String(comment.id))}`,
      title: `Review comment ${comment.id}`,
    });
  }

  let candidateReviewsMayBeOmitted = input.client.listPullRequestReviews === undefined;
  if (input.client.listPullRequestReviews !== undefined) {
    try {
      const reviews = await input.client.listPullRequestReviews(input.lookup, REVIEW_LIMIT + 1);
      candidateReviewsMayBeOmitted = reviews.length > REVIEW_LIMIT;
      for (const review of reviews.slice(0, REVIEW_LIMIT)) {
        if (review.state === "PENDING") continue;
        const item: EvidenceItemInput = {
          kind: "review",
          id: `review:${review.id}`,
          url: `${prUrl}#pullrequestreview-${encodeURIComponent(String(review.id))}`,
          title: `Submitted review (${review.state})`,
          ...prepareEvidenceExcerpt(review.body ?? undefined),
        };
        const { excerpt: _excerpt, excerptRedactionReport: _report, ...ref } = item;
        add(review.user, "reviewer", ref);
        evidenceItems.push(item);
      }
    } catch {
      candidateReviewsMayBeOmitted = true;
    }
  }

  let candidateIssueLookupsUnavailable = 0;
  for (const reference of input.linkedIssues.slice(0, ISSUE_LIMIT)) {
    if (input.client.getIssue === undefined) {
      candidateIssueLookupsUnavailable += 1;
      continue;
    }
    const separator = reference.id.lastIndexOf("#");
    const repository = separator === 0 ? input.lookup.repository : reference.id.slice(0, separator);
    const issueNumber = Number(reference.id.slice(separator + 1));
    try {
      const issue = await input.client.getIssue({ repository, issueNumber });
      if (issue.isPullRequest) continue;
      if (issue.number !== issueNumber) {
        candidateIssueLookupsUnavailable += 1;
        continue;
      }
      const item: EvidenceItemInput = {
        kind: "issue",
        id: reference.id,
        url: `https://github.com/${repository}/issues/${issueNumber}`,
        title: `Linked issue ${issueNumber}`,
        ...prepareEvidenceExcerpt(`${issue.title}\n${issue.body ?? ""}`),
      };
      const { excerpt: _excerpt, excerptRedactionReport: _report, ...ref } = item;
      add(issue.user, "issue_reporter", ref);
      evidenceItems.push(item);
    } catch {
      candidateIssueLookupsUnavailable += 1;
    }
  }
  return {
    candidates: [...candidates.values()],
    evidenceItems,
    coverage: {
      candidateReviewsMayBeOmitted,
      candidateIssuesMayBeOmitted: input.linkedIssues.length > ISSUE_LIMIT,
      candidateIssueLookupsUnavailable,
    },
  };
}
