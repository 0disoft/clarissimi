import { canPublishAssessment } from "@clarissimi/core";
import type { ContributionAssessment } from "@clarissimi/schemas";

import { RendererValidationError, type PublicContributionRecord } from "./types.js";

export function toPublicContributionRecord(value: unknown): PublicContributionRecord {
  const result = canPublishAssessment(value);

  if (!result.ok) {
    throw new RendererValidationError(
      "Only valid approved assessments can be rendered as public contribution records.",
      result.issues
    );
  }

  return sanitizePublicContributionRecord(result.value.assessment);
}

export function toPublicContributionRecords(
  values: readonly unknown[]
): readonly PublicContributionRecord[] {
  return values.map(toPublicContributionRecord);
}

export function appendPublicContributionRecord(
  existingValues: readonly unknown[],
  nextValue: unknown
): readonly PublicContributionRecord[] {
  const existingRecords = toPublicContributionRecords(existingValues);
  assertUniqueContributionRecords(existingRecords);
  const nextRecord = toPublicContributionRecord(nextValue);

  if (existingRecords.some((record) => hasSameContributionIdentity(record, nextRecord))) {
    throw new RendererValidationError("Contribution already exists in the selected ledger.", [
      {
        path: "$.source",
        code: "duplicate_source",
        message: "A contribution from this contributor and merged pull request is already recorded."
      }
    ]);
  }

  return [...existingRecords, nextRecord];
}

export function assertUniqueContributionRecords(
  records: readonly PublicContributionRecord[]
): void {
  const seen = new Map<string, number>();

  records.forEach((record, index) => {
    const key = contributionIdentityKey(record);
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      throw new RendererValidationError("Ledger contains duplicate contribution records.", [
        {
          path: `$[${index}].source`,
          code: "duplicate_source",
          message:
            "Ledger records must be unique for contributor platform, contributor id, repository, event, and pull request number."
        },
        {
          path: `$[${firstIndex}].source`,
          code: "duplicate_source_original",
          message: "This earlier ledger record has the same contribution identity."
        }
      ]);
    }

    seen.set(key, index);
  });
}

export function renderContributionsJsonl(values: readonly unknown[]): string {
  const records = toPublicContributionRecords(values);
  if (records.length === 0) {
    return "";
  }

  return `${records.map((record) => stableStringify(record)).join("\n")}\n`;
}

function sanitizePublicContributionRecord(
  assessment: ContributionAssessment
): PublicContributionRecord {
  return {
    schemaVersion: assessment.schemaVersion,
    contributor: {
      platform: assessment.contributor.platform,
      id: assessment.contributor.id,
      login: assessment.contributor.login,
      profileUrl: assessment.contributor.profileUrl
    },
    contributionType: assessment.contributionType,
    affectedArea: assessment.affectedArea,
    impactLevel: assessment.impactLevel,
    evidenceSummary: assessment.evidenceSummary,
    evidenceRefs: assessment.evidenceRefs.map((ref) => ({
      kind: ref.kind,
      id: ref.id,
      ...(ref.url === undefined ? {} : { url: ref.url }),
      ...(ref.title === undefined ? {} : { title: ref.title })
    })),
    suggestedBadge: assessment.suggestedBadge,
    publicRecognitionText: assessment.publicRecognitionText,
    confidence: assessment.confidence,
    maintainerApprovalStatus: assessment.maintainerApprovalStatus,
    source: {
      repository: assessment.source.repository,
      event: assessment.source.event,
      pullRequestNumber: assessment.source.pullRequestNumber,
      ...(assessment.source.mergedAt === undefined ? {} : { mergedAt: assessment.source.mergedAt })
    }
  };
}

export function parseContributionsJsonl(input: string): readonly PublicContributionRecord[] {
  const records: PublicContributionRecord[] = [];

  input.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new RendererValidationError("Ledger JSONL contains an invalid JSON line.", [
        {
          path: `$[${index}]`,
          code: "invalid_json",
          message: "Ledger line must be valid JSON."
        }
      ]);
    }

    records.push(toPublicContributionRecord(parsed));
  });

  return records;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function hasSameContributionIdentity(
  left: PublicContributionRecord,
  right: PublicContributionRecord
): boolean {
  return contributionIdentityKey(left) === contributionIdentityKey(right);
}

function contributionIdentityKey(record: PublicContributionRecord): string {
  return [
    record.contributor.platform,
    record.contributor.id,
    record.source.repository,
    record.source.event,
    String(record.source.pullRequestNumber)
  ].join("\0");
}

export function renderPrettyJson(value: unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = sortJsonValue(value[key]);
      });
    return sorted;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
