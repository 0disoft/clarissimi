import { readFile } from "node:fs/promises";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import {
  collectMergedPullRequestEvidence,
  type GitHubMergedPullRequestFixture
} from "@clarissimi/github";
import { createFakeContributionDraftProvider } from "@clarissimi/providers";

import { resolveGitHubEventPayload } from "./event.js";
import { sanitizeAssessmentForActionSummary } from "./summary.js";
import type {
  ActionDryRunInput,
  ActionDryRunSummary,
  ActionInputSource,
  ActionProcessIo
} from "./types.js";

export class ActionUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionUsageError";
  }
}

export async function runActionDryRun(input: ActionDryRunInput): Promise<ActionDryRunSummary> {
  const mode = input.mode ?? "dry-run";
  if (mode !== "dry-run") {
    throw new ActionUsageError("The action skeleton currently supports only dry-run mode.");
  }

  const source = selectInputSource(input);
  const eventPayload = JSON.parse(await readFile(source.path, "utf8")) as unknown;
  const resolution = source.kind === "github_fixture"
    ? {
        kind: "merged_pull_request" as const,
        fixture: eventPayload as GitHubMergedPullRequestFixture
      }
    : resolveGitHubEventPayload(eventPayload);

  if (resolution.kind === "skipped") {
    return {
      ok: true,
      mode: "dry-run",
      inputSource: source.kind,
      draftCount: 0,
      proposedEntryCount: 0,
      skippedEntryCount: 1,
      publicOutputsRendered: false,
      approvalStatus: null,
      redactionChanged: false,
      redactionMatchCount: 0,
      skippedReason: resolution.reason
    };
  }

  const collected = collectMergedPullRequestEvidence(resolution.fixture);
  const preparedEvidence = prepareEvidenceForProvider(collected.evidence);
  const provider = createFakeContributionDraftProvider();
  const assessment = await provider.createAssessment({
    contributor: collected.contributor,
    preparedEvidence
  });

  return {
    ok: true,
    mode: "dry-run",
    inputSource: source.kind,
    draftCount: 1,
    proposedEntryCount: 0,
    skippedEntryCount: 0,
    publicOutputsRendered: false,
    approvalStatus: assessment.maintainerApprovalStatus,
    redactionChanged: preparedEvidence.redactionReport.changed,
    redactionMatchCount: preparedEvidence.redactionReport.occurrences.length,
    assessment: sanitizeAssessmentForActionSummary(assessment)
  };
}

export async function runActionFromEnvironment(
  env: NodeJS.ProcessEnv,
  io: ActionProcessIo
): Promise<number> {
  try {
    const input: ActionDryRunInput = {
      mode: env.INPUT_MODE ?? "dry-run"
    };
    assignOptional(input, "eventPath", env.INPUT_EVENT_PATH ?? env.GITHUB_EVENT_PATH);
    assignOptional(input, "githubFixturePath", env.INPUT_GITHUB_FIXTURE);

    const summary = await runActionDryRun(input);
    io.stdout(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return error instanceof ActionUsageError ? 1 : 4;
  }
}

function selectInputSource(input: ActionDryRunInput): {
  readonly kind: ActionInputSource;
  readonly path: string;
} {
  if (input.eventPath !== undefined && input.githubFixturePath !== undefined) {
    throw new ActionUsageError(
      "Use only one action input source: eventPath or githubFixturePath."
    );
  }

  if (input.githubFixturePath !== undefined) {
    return {
      kind: "github_fixture",
      path: input.githubFixturePath
    };
  }

  if (input.eventPath !== undefined) {
    return {
      kind: "github_event_path",
      path: input.eventPath
    };
  }

  throw new ActionUsageError("The action skeleton requires GITHUB_EVENT_PATH or INPUT_GITHUB_FIXTURE.");
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
