import { prepareEvidenceForProvider, type EvidenceBundleInput } from "@clarissimi/core";
import {
  collectMergedPullRequestEvidence,
  parseGitHubMergedPullRequestFixture,
} from "@clarissimi/github";
import {
  createFakeContributionDraftProvider,
  type ContributionDraftProvider,
  type ProviderAssessmentHints,
} from "@clarissimi/providers";
import {
  isApprovalStatus,
  type ApprovalStatus,
  type ContributionAssessment,
  type ContributorIdentity,
} from "@clarissimi/schemas";

import { parseJsonText, readTextFile } from "./io.js";

export interface RecognitionFixture {
  readonly contributor: ContributorIdentity;
  readonly evidence: EvidenceBundleInput;
  readonly hints?: ProviderAssessmentHints;
  readonly maintainerApprovalStatus?: ApprovalStatus;
}

export interface FixtureRecognitionResult {
  readonly fixtureKind: "evidence" | "github";
  readonly draft: ContributionAssessment;
  readonly assessment: ContributionAssessment;
  readonly redactionChanged: boolean;
  readonly redactionMatchCount: number;
}

export async function readRecognitionFixture(path: string): Promise<RecognitionFixture> {
  const parsed = parseJsonText(await readTextFile(path), path);
  return parseRecognitionFixture(parsed);
}

export async function recognizeFixture(
  path: string,
  provider?: ContributionDraftProvider,
): Promise<FixtureRecognitionResult> {
  const fixture = await readRecognitionFixture(path);
  return recognizeCollectedFixture(fixture, "evidence", provider);
}

export async function recognizeGitHubFixture(
  path: string,
  provider?: ContributionDraftProvider,
): Promise<FixtureRecognitionResult> {
  const parsed = parseJsonText(await readTextFile(path), path);
  const collected = collectMergedPullRequestEvidence(parseGitHubMergedPullRequestFixture(parsed));

  return recognizeCollectedFixture(
    {
      contributor: collected.contributor,
      evidence: collected.evidence,
    },
    "github",
    provider,
  );
}

async function recognizeCollectedFixture(
  fixture: RecognitionFixture,
  fixtureKind: FixtureRecognitionResult["fixtureKind"],
  selectedProvider?: ContributionDraftProvider,
): Promise<FixtureRecognitionResult> {
  const preparedEvidence = prepareEvidenceForProvider(fixture.evidence);
  const provider = selectedProvider ?? createFakeContributionDraftProvider();
  const providerInput = {
    contributor: fixture.contributor,
    preparedEvidence,
  };

  if (fixture.hints !== undefined) {
    Object.assign(providerInput, {
      hints: fixture.hints,
    });
  }

  const draft = await provider.createAssessment(providerInput);
  const assessment = applyFixtureApproval(draft, fixture.maintainerApprovalStatus);

  return {
    fixtureKind,
    draft,
    assessment,
    redactionChanged: preparedEvidence.redactionReport.changed,
    redactionMatchCount: preparedEvidence.redactionReport.occurrences.length,
  };
}

function parseRecognitionFixture(value: unknown): RecognitionFixture {
  if (!isRecord(value)) {
    throw new Error("Recognition fixture must be a JSON object.");
  }

  assertRecord(value.contributor, "contributor");
  assertRecord(value.evidence, "evidence");

  const hints = parseOptionalRecord(value.hints, "hints") as ProviderAssessmentHints | undefined;
  const maintainerApprovalStatus = parseOptionalApprovalStatus(value.maintainerApprovalStatus);
  const fixture: RecognitionFixture = {
    contributor: value.contributor as unknown as ContributorIdentity,
    evidence: value.evidence as unknown as EvidenceBundleInput,
  };

  if (hints !== undefined) {
    Object.assign(fixture, { hints });
  }

  if (maintainerApprovalStatus !== undefined) {
    Object.assign(fixture, { maintainerApprovalStatus });
  }

  return fixture;
}

function applyFixtureApproval(
  draft: ContributionAssessment,
  status: ApprovalStatus | undefined,
): ContributionAssessment {
  if (status === undefined || status === "draft") {
    return draft;
  }

  return {
    ...draft,
    maintainerApprovalStatus: status,
  };
}

function parseOptionalApprovalStatus(value: unknown): ApprovalStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !isApprovalStatus(value)) {
    throw new Error("maintainerApprovalStatus must be a known approval status.");
  }

  return value;
}

function parseOptionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  assertRecord(value, field);
  return value;
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Recognition fixture field ${field} must be an object.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
