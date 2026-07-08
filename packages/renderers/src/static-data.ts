import {
  STATIC_DATA_SCHEMA_VERSION,
  type StaticContributionRecord,
  type StaticContributionsDocument
} from "./types.js";
import { deriveContributorProfiles } from "./contributors.js";
import { renderPrettyJson, toPublicContributionRecords } from "./ledger.js";

export function buildStaticContributionsDocument(
  values: readonly unknown[]
): StaticContributionsDocument {
  const records = toPublicContributionRecords(values);

  return {
    schemaVersion: STATIC_DATA_SCHEMA_VERSION,
    contributions: records.map(toStaticContributionRecord),
    contributors: deriveContributorProfiles(records)
  };
}

export function renderStaticContributionsJson(values: readonly unknown[]): string {
  return renderPrettyJson(buildStaticContributionsDocument(values));
}

function toStaticContributionRecord(record: ReturnType<typeof toPublicContributionRecords>[number]): StaticContributionRecord {
  return {
    contributor: record.contributor,
    source: record.source,
    contributionType: record.contributionType,
    affectedArea: record.affectedArea,
    publicRecognitionText: record.publicRecognitionText,
    suggestedBadge: record.suggestedBadge,
    evidenceRefs: record.evidenceRefs
  };
}
