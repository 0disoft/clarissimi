import type { ContributionType, ImpactLevel } from "@clarissimi/schemas";

import {
  MAINTAINER_ANALYTICS_SCHEMA_VERSION,
  RendererValidationError,
  type MaintainerRecentRecognitionShareContributor,
  type MaintainerRecentRecognitionShareDocument,
  type MaintainerRecentRecognitionShareOptions,
  type PublicContributionRecord,
} from "./types.js";
import { renderPrettyJson, toPublicContributionRecords } from "./ledger.js";

const DEFAULT_RECENT_WINDOW_DAYS = 90;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const IMPACT_LEVEL_RECOGNITION_WEIGHTS: Record<ImpactLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function buildMaintainerRecentRecognitionShareDocument(
  values: readonly unknown[],
  options: MaintainerRecentRecognitionShareOptions = {},
): MaintainerRecentRecognitionShareDocument {
  const records = toPublicContributionRecords(values);
  const windowDays = normalizeWindowDays(options.windowDays);
  const asOf = normalizeAsOf(options.asOf);
  const startsAtMs = Date.parse(asOf) - windowDays * DAY_IN_MILLISECONDS;
  const startsAt = new Date(startsAtMs).toISOString();
  const grouped = new Map<string, ContributorAccumulator>();
  let includedRecords = 0;
  let excludedRecordsWithoutMergedAt = 0;
  let totalRecognitionWeight = 0;

  records.forEach((record) => {
    const mergedAt = record.source.mergedAt;
    if (mergedAt === undefined) {
      excludedRecordsWithoutMergedAt += 1;
      return;
    }

    const mergedAtMs = Date.parse(mergedAt);
    if (mergedAtMs < startsAtMs || mergedAtMs > Date.parse(asOf)) {
      return;
    }

    const weight = IMPACT_LEVEL_RECOGNITION_WEIGHTS[record.impactLevel];
    const key = contributorKey(record);
    const existing = grouped.get(key) ?? createContributorAccumulator(record);
    existing.contributor = record.contributor;
    existing.recognitionCount += 1;
    existing.recognitionWeight += weight;
    existing.contributionTypes.add(record.contributionType);
    existing.affectedAreas.add(record.affectedArea);
    grouped.set(key, existing);
    includedRecords += 1;
    totalRecognitionWeight += weight;
  });

  return {
    schemaVersion: MAINTAINER_ANALYTICS_SCHEMA_VERSION,
    scope: "maintainer-only",
    metric: "recent_recognition_weight_share",
    window: {
      asOf,
      startsAt,
      windowDays,
      includedRecords,
      excludedRecordsWithoutMergedAt,
      totalRecognitionWeight,
    },
    contributors: Array.from(grouped.values())
      .map((entry) => toRecentShareContributor(entry, totalRecognitionWeight))
      .sort(compareRecentShareContributors),
  };
}

export function renderMaintainerRecentRecognitionShareJson(
  values: readonly unknown[],
  options: MaintainerRecentRecognitionShareOptions = {},
): string {
  return renderPrettyJson(buildMaintainerRecentRecognitionShareDocument(values, options));
}

function normalizeWindowDays(value: number | undefined): number {
  const windowDays = value ?? DEFAULT_RECENT_WINDOW_DAYS;
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new RendererValidationError(
      "Recent recognition share requires a positive integer window.",
      [
        {
          path: "$.windowDays",
          code: "invalid_window_days",
          message: "windowDays must be a positive integer.",
        },
      ],
    );
  }

  return windowDays;
}

function normalizeAsOf(value: string | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new RendererValidationError("Recent recognition share requires a valid as-of date.", [
      {
        path: "$.asOf",
        code: "invalid_datetime",
        message: "asOf must be an ISO-compatible date time.",
      },
    ]);
  }

  return new Date(parsed).toISOString();
}

function toRecentShareContributor(
  entry: ContributorAccumulator,
  totalRecognitionWeight: number,
): MaintainerRecentRecognitionShareContributor {
  return {
    contributor: entry.contributor,
    recognitionCount: entry.recognitionCount,
    recognitionWeight: entry.recognitionWeight,
    recognitionShare:
      totalRecognitionWeight === 0
        ? 0
        : roundShare(entry.recognitionWeight / totalRecognitionWeight),
    contributionTypes: uniqueSorted(Array.from(entry.contributionTypes)),
    affectedAreas: uniqueSorted(Array.from(entry.affectedAreas)),
  };
}

function createContributorAccumulator(record: PublicContributionRecord): ContributorAccumulator {
  return {
    contributor: record.contributor,
    recognitionCount: 0,
    recognitionWeight: 0,
    contributionTypes: new Set(),
    affectedAreas: new Set(),
  };
}

function compareRecentShareContributors(
  left: MaintainerRecentRecognitionShareContributor,
  right: MaintainerRecentRecognitionShareContributor,
): number {
  return (
    right.recognitionWeight - left.recognitionWeight ||
    right.recognitionCount - left.recognitionCount ||
    left.contributor.login.localeCompare(right.contributor.login) ||
    left.contributor.id.localeCompare(right.contributor.id)
  );
}

function roundShare(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function contributorKey(record: PublicContributionRecord): string {
  return `${record.contributor.platform}:${record.contributor.id}`;
}

function uniqueSorted<T extends string | ContributionType>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

interface ContributorAccumulator {
  contributor: PublicContributionRecord["contributor"];
  recognitionCount: number;
  recognitionWeight: number;
  readonly contributionTypes: Set<ContributionType>;
  readonly affectedAreas: Set<string>;
}
