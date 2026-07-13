import {
  CONTRIBUTORS_JSON_PATH,
  CONTRIBUTORS_MARKDOWN_PATH,
  CONTRIBUTIONS_JSONL_PATH,
  STATIC_DATA_JSON_PATH,
  type RenderedRecognitionOutputs,
} from "./types.js";
import { renderContributorsJson } from "./contributors.js";
import { renderContributionsJsonl } from "./ledger.js";
import { renderContributorsMarkdown } from "./markdown.js";
import type { ContributorsMarkdownOptions } from "./markdown.js";
import { renderStaticContributionsJson } from "./static-data.js";

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
  return {
    contributionsJsonl: renderContributionsJsonl(values),
    contributorsJson: renderContributorsJson(values, markdownOptions),
    contributorsMarkdown: renderContributorsMarkdown(values, markdownOptions),
    staticDataJson: renderStaticContributionsJson(values, markdownOptions),
  };
}
