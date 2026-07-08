import type { GitHubMergedPullRequestFixture } from "@clarissimi/github";

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
      reason: "GitHub event payload must be a JSON object."
    };
  }

  if (!isRecord(value.repository) || typeof value.repository.full_name !== "string") {
    return {
      kind: "skipped",
      reason: "GitHub event payload does not include repository.full_name."
    };
  }

  if (!isRecord(value.pull_request)) {
    return {
      kind: "skipped",
      reason: "GitHub event payload does not include a pull_request object."
    };
  }

  const pullRequest = value.pull_request;
  const mergedAt = typeof pullRequest.merged_at === "string" ? pullRequest.merged_at : undefined;
  if (mergedAt === undefined) {
    return {
      kind: "skipped",
      reason: "GitHub pull request event is not a merged pull request."
    };
  }

  if (!isRecord(pullRequest.user)) {
    return {
      kind: "skipped",
      reason: "GitHub pull request event does not include pull_request.user."
    };
  }

  const fixture: GitHubMergedPullRequestFixture = {
    repository: {
      fullName: value.repository.full_name
    },
    pullRequest: {
      number: pullRequest.number as number,
      title: pullRequest.title as string,
      mergedAt,
      user: {
        id: pullRequest.user.id as number | string,
        login: pullRequest.user.login as string
      },
      labels: parseLabels(pullRequest.labels)
    }
  };

  assignOptional(fixture.pullRequest, "body", optionalString(pullRequest.body));
  assignOptional(fixture.pullRequest, "htmlUrl", optionalString(pullRequest.html_url));
  assignOptional(fixture.pullRequest.user, "htmlUrl", optionalString(pullRequest.user.html_url));
  assignOptional(
    fixture.pullRequest,
    "mergeCommitSha",
    optionalString(pullRequest.merge_commit_sha)
  );

  return {
    kind: "merged_pull_request",
    fixture
  };
}

function parseLabels(
  value: unknown
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
        name: entry.name
      }
    ];
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
