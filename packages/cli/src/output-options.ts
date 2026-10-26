import { isConfigMarkdownSummary, type ConfigMarkdownSummary } from "@clarissimi/schemas";
import { CliUsageError, getStringFlag, getBooleanFlag, type ParsedArgs } from "./args.js";
import type { CliConfig } from "./config.js";

export function resolveMarkdownSummary(args: ParsedArgs, config: CliConfig): ConfigMarkdownSummary {
  const value = getStringFlag(args, "markdown-summary") ?? config.markdownSummary ?? "none";
  if (!isConfigMarkdownSummary(value)) {
    throw new CliUsageError(`Unsupported Markdown summary: ${value}`);
  }

  return value;
}

export function resolveIncludeAutomationContributors(args: ParsedArgs, config: CliConfig): boolean {
  if (getBooleanFlag(args, "exclude-automation-contributors")) {
    return false;
  }

  return config.includeAutomationContributors ?? true;
}
