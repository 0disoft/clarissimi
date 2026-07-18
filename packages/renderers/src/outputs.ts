import {
  CONTRIBUTORS_JSON_PATH,
  CONTRIBUTORS_MARKDOWN_PATH,
  CONTRIBUTIONS_JSONL_PATH,
  STATIC_DATA_JSON_PATH,
  type RenderedRecognitionOutputs,
} from "./types.js";
import {
  deriveContributorProfilesFromPublicRecords,
  filterDisplayedRecords,
  renderContributorsJsonFromProfiles,
} from "./contributors.js";
import { renderPublicContributionRecordsJsonl, toPublicContributionRecords } from "./ledger.js";
import { renderContributorProfilesMarkdown } from "./markdown.js";
import type { ContributorsMarkdownOptions } from "./markdown.js";
import { renderStaticContributionsJsonFromPublicRecords } from "./static-data.js";

export const RENDERED_OUTPUT_PATHS = {
  contributionsJsonl: CONTRIBUTIONS_JSONL_PATH,
  contributorsJson: CONTRIBUTORS_JSON_PATH,
  contributorsMarkdown: CONTRIBUTORS_MARKDOWN_PATH,
  staticDataJson: STATIC_DATA_JSON_PATH,
} as const;

export function renderRecognitionOutputs(
  values: readonly unknown[],
  markdownOptions: ContributorsMarkdownOptions = {},
): RenderedRecognitionOutputs {
  const records = toPublicContributionRecords(values);
  const displayedRecords = filterDisplayedRecords(records, markdownOptions);
  const profiles = deriveContributorProfilesFromPublicRecords(displayedRecords);

  return {
    contributionsJsonl: renderPublicContributionRecordsJsonl(records),
    contributorsJson: renderContributorsJsonFromProfiles(profiles),
    contributorsMarkdown: renderContributorProfilesMarkdown(profiles, markdownOptions),
    staticDataJson: renderStaticContributionsJsonFromPublicRecords(displayedRecords, profiles),
  };
}
