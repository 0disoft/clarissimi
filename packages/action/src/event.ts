import {
  parseGitHubMergedPullRequestFixture,
  type GitHubMergedPullRequestFixture,
} from "@clarissimi/github";

export type GitHubActionEventResolution =
  | {
      readonly kind: "merged_pull_request";
      readonly fixture: GitHubMergedPullRequestFixture;
    }
  | {
      readonly kind: "skipped";
      readonly reason: string;
    };

export function resolveGitHubEventPayload(value: unknown): GitHubActionEventResolution {
  if (!isRecord(value)) {
    return {
      kind: "skipped",
      reason: "GitHub event payload must be a JSON object.",
    };
  }

  if (!isRecord(value.repository) || typeof value.repository.full_name !== "string") {
    return {
      kind: "skipped",
      reason: "GitHub event payload does not include repository.full_name.",
    };
  }

  if (!isRecord(value.pull_request)) {
    return {
      kind: "skipped",
      reason: "GitHub event payload does not include a pull_request object.",
    };
  }

  const pullRequest = value.pull_request;
  const contributorKind = isRecord(pullRequest.user)
    ? parseActorKind(pullRequest.user.type)
    : undefined;
  const mergedAt = typeof pullRequest.merged_at === "string" ? pullRequest.merged_at : undefined;
  if (mergedAt === undefined) {
    return {
      kind: "skipped",
      reason: "GitHub pull request event is not a merged pull request.",
    };
  }

  if (!isRecord(pullRequest.user)) {
    return {
      kind: "skipped",
      reason: "GitHub pull request event does not include pull_request.user.",
    };
  }

  const body = optionalString(pullRequest.body);
  const htmlUrl = optionalString(pullRequest.html_url);
  const userHtmlUrl = optionalString(pullRequest.user.html_url);
  const mergeCommitSha = optionalString(pullRequest.merge_commit_sha);

  const fixture = parseGitHubMergedPullRequestFixture({
    repository: {
      fullName: value.repository.full_name,
    },
    pullRequest: {
      number: pullRequest.number,
      title: pullRequest.title,
      mergedAt,
      user: {
        id: pullRequest.user.id,
        login: pullRequest.user.login,
        ...(contributorKind === undefined ? {} : { kind: contributorKind }),
        ...(userHtmlUrl === undefined ? {} : { htmlUrl: userHtmlUrl }),
      },
      labels: parseLabels(pullRequest.labels),
      ...(body === undefined ? {} : { body }),
      ...(htmlUrl === undefined ? {} : { htmlUrl }),
      ...(mergeCommitSha === undefined ? {} : { mergeCommitSha }),
    },
  });

  return {
    kind: "merged_pull_request",
    fixture,
  };
}

function parseActorKind(value: unknown): "human" | "bot" | undefined {
  if (value === "Bot") {
    return "bot";
  }

  if (value === "User" || value === "Organization") {
    return "human";
  }

  return undefined;
}

function parseLabels(
  value: unknown,
): NonNullable<GitHubMergedPullRequestFixture["pullRequest"]["labels"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string") {
      return [];
    }

    return [
      {
        name: entry.name,
      },
    ];
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
