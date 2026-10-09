import {
  PROVIDER_EVIDENCE_LIMITS,
  prepareEvidenceForProvider,
  type EvidenceBundleInput,
} from "@clarissimi/core";
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
  isEvidenceKind,
  validateContributorIdentity,
  validateRecognitionSource,
  type ApprovalStatus,
  type ContributionAssessment,
  type ContributorIdentity,
  type ValidationResult,
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
  const contributor = validatedFixtureField(
    validateContributorIdentity(fixture.contributor),
    "contributor",
  );
  const source = validatedFixtureField(
    validateRecognitionSource(fixture.evidence.source),
    "evidence.source",
  );
  const preparedEvidence = prepareEvidenceForProvider({ ...fixture.evidence, source });
  const provider = selectedProvider ?? createFakeContributionDraftProvider();
  const providerInput = {
    contributor,
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

function validatedFixtureField<T>(result: ValidationResult<T>, field: string): T {
  if (result.ok) {
    return result.value;
  }
  const issue = result.issues[0];
  const path = issue === undefined || issue.path === "$" ? field : `${field}${issue.path.slice(1)}`;
  throw new Error(`Recognition fixture field ${path}: ${issue?.message ?? "Value is invalid."}`);
}

function parseRecognitionFixture(value: unknown): RecognitionFixture {
  if (!isRecord(value)) {
    throw new Error("Recognition fixture must be a JSON object.");
  }

  assertRecord(value.contributor, "contributor");
  assertRecord(value.evidence, "evidence");
  assertEvidenceItems(value.evidence.items);

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

function assertEvidenceItems(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Recognition fixture field evidence.items must be a non-empty array.");
  }
  if (value.length > PROVIDER_EVIDENCE_LIMITS.maxItems) {
    throw new Error(
      `Recognition fixture field evidence.items must not exceed ${PROVIDER_EVIDENCE_LIMITS.maxItems} items.`,
    );
  }
  for (const [index, item] of value.entries()) {
    const path = `evidence.items[${index}]`;
    assertRecord(item, path);
    if (typeof item.kind !== "string" || !isEvidenceKind(item.kind)) {
      throw new Error(`Recognition fixture field ${path}.kind must be a known evidence kind.`);
    }
    for (const field of ["id", "url", "title", "excerpt", "text"] as const) {
      const input = item[field];
      if (field !== "id" && input === undefined) {
        continue;
      }
      if (typeof input !== "string" || input.trim().length === 0) {
        throw new Error(`Recognition fixture field ${path}.${field} must be a non-empty string.`);
      }
      if (field === "url") {
        try {
          new URL(input);
        } catch {
          throw new Error(`Recognition fixture field ${path}.url must be a valid URL.`);
        }
      }
    }
  }
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
