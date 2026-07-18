import type { ContributionType } from "@clarissimi/schemas";

import {
  CONTRIBUTORS_JSON_SCHEMA_VERSION,
  type ContributorRecognitionProfile,
  type ContributorsJsonDocument,
  type PublicContributionRecord,
  type PublicRecognitionSummary,
} from "./types.js";
import { renderPrettyJson, toPublicContributionRecords } from "./ledger.js";

export function deriveContributorProfiles(
  values: readonly unknown[],
  options: ContributorDisplayOptions = {},
): readonly ContributorRecognitionProfile[] {
  const records = filterDisplayedRecords(toPublicContributionRecords(values), options);
  return deriveContributorProfilesFromPublicRecords(records);
}

export function deriveContributorProfilesFromPublicRecords(
  records: readonly PublicContributionRecord[],
): readonly ContributorRecognitionProfile[] {
  const grouped = new Map<string, PublicContributionRecord[]>();

  records.forEach((record) => {
    const key = contributorKey(record);
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, [record]);
      return;
    }

    existing.push(record);
  });

  return Array.from(grouped.values()).map(toContributorProfile).sort(compareContributorProfiles);
}

export function buildContributorsJsonDocument(
  values: readonly unknown[],
  options: ContributorDisplayOptions = {},
): ContributorsJsonDocument {
  return buildContributorsJsonDocumentFromProfiles(deriveContributorProfiles(values, options));
}

export function buildContributorsJsonDocumentFromProfiles(
  profiles: readonly ContributorRecognitionProfile[],
): ContributorsJsonDocument {
  return {
    schemaVersion: CONTRIBUTORS_JSON_SCHEMA_VERSION,
    contributors: profiles,
  };
}

export function renderContributorsJson(
  values: readonly unknown[],
  options: ContributorDisplayOptions = {},
): string {
  return renderContributorsJsonFromProfiles(deriveContributorProfiles(values, options));
}

export function renderContributorsJsonFromProfiles(
  profiles: readonly ContributorRecognitionProfile[],
): string {
  return renderPrettyJson(buildContributorsJsonDocumentFromProfiles(profiles));
}

export interface ContributorDisplayOptions {
  readonly includeAutomationContributors?: boolean;
}

export function filterDisplayedRecords(
  records: readonly PublicContributionRecord[],
  options: ContributorDisplayOptions = {},
): readonly PublicContributionRecord[] {
  if (options.includeAutomationContributors !== false) {
    return records;
  }

  return records.filter((record) => !isAutomationContributor(record.contributor.kind));
}

function isAutomationContributor(kind: PublicContributionRecord["contributor"]["kind"]): boolean {
  return kind === "bot" || kind === "ai_agent";
}

function toContributorProfile(
  records: readonly PublicContributionRecord[],
): ContributorRecognitionProfile {
  const latest = records.at(-1);
  if (latest === undefined) {
    throw new Error("Contributor profile requires at least one contribution record.");
  }

  const recognitions = records.map(toRecognitionSummary).sort(compareRecognitionSummaries);

  return {
    contributor: latest.contributor,
    contributionCount: records.length,
    contributionTypes: uniqueSorted(records.map((record) => record.contributionType)),
    affectedAreas: uniqueSorted(records.map((record) => record.affectedArea)),
    badges: uniqueSorted(records.map((record) => record.suggestedBadge)),
    recognitions,
  };
}

function toRecognitionSummary(record: PublicContributionRecord): PublicRecognitionSummary {
  return {
    source: record.source,
    contributionType: record.contributionType,
    affectedArea: record.affectedArea,
    publicRecognitionText: record.publicRecognitionText,
    suggestedBadge: record.suggestedBadge,
    evidenceRefs: record.evidenceRefs,
  };
}

function contributorKey(record: PublicContributionRecord): string {
  return `${record.contributor.platform}:${record.contributor.id}`;
}

function compareContributorProfiles(
  left: ContributorRecognitionProfile,
  right: ContributorRecognitionProfile,
): number {
  return (
    left.contributor.login.localeCompare(right.contributor.login) ||
    left.contributor.id.localeCompare(right.contributor.id)
  );
}

function compareRecognitionSummaries(
  left: PublicRecognitionSummary,
  right: PublicRecognitionSummary,
): number {
  return (
    left.source.repository.localeCompare(right.source.repository) ||
    left.source.pullRequestNumber - right.source.pullRequestNumber ||
    left.publicRecognitionText.localeCompare(right.publicRecognitionText)
  );
}

function uniqueSorted<T extends string | ContributionType>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
