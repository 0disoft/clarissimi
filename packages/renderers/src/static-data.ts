import {
  STATIC_DATA_SCHEMA_VERSION,
  type ContributorRecognitionProfile,
  type PublicContributionRecord,
  type StaticContributionRecord,
  type StaticContributionsDocument,
} from "./types.js";
import {
  deriveContributorProfilesFromPublicRecords,
  filterDisplayedRecords,
  type ContributorDisplayOptions,
} from "./contributors.js";
import { renderPrettyJson, toPublicContributionRecords } from "./ledger.js";

export function buildStaticContributionsDocument(
  values: readonly unknown[],
  options: ContributorDisplayOptions = {},
): StaticContributionsDocument {
  const records = filterDisplayedRecords(toPublicContributionRecords(values), options);
  const profiles = deriveContributorProfilesFromPublicRecords(records);
  return buildStaticContributionsDocumentFromPublicRecords(records, profiles);
}

export function buildStaticContributionsDocumentFromPublicRecords(
  records: readonly PublicContributionRecord[],
  profiles: readonly ContributorRecognitionProfile[],
): StaticContributionsDocument {
  return {
    schemaVersion: STATIC_DATA_SCHEMA_VERSION,
    contributions: records.map(toStaticContributionRecord),
    contributors: profiles,
  };
}

export function renderStaticContributionsJson(
  values: readonly unknown[],
  options: ContributorDisplayOptions = {},
): string {
  return renderPrettyJson(buildStaticContributionsDocument(values, options));
}

export function renderStaticContributionsJsonFromPublicRecords(
  records: readonly PublicContributionRecord[],
  profiles: readonly ContributorRecognitionProfile[],
): string {
  return renderPrettyJson(buildStaticContributionsDocumentFromPublicRecords(records, profiles));
}

function toStaticContributionRecord(record: PublicContributionRecord): StaticContributionRecord {
  return {
    contributor: record.contributor,
    source: record.source,
    contributionType: record.contributionType,
    affectedArea: record.affectedArea,
    publicRecognitionText: record.publicRecognitionText,
    suggestedBadge: record.suggestedBadge,
    evidenceRefs: record.evidenceRefs,
  };
}
