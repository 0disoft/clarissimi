import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  isConfigMarkdownSummary,
  type ClarissimiConfig,
  type ValidationIssue,
  validateClarissimiConfig,
} from "@clarissimi/schemas";

import { readEnvInput } from "./environment.js";
import { ActionUsageError } from "./errors.js";

export async function loadActionConfigFromEnvironment(
  env: NodeJS.ProcessEnv,
): Promise<ClarissimiConfig> {
  const configPath = readEnvInput(env.INPUT_CONFIG_PATH);
  if (configPath === undefined) {
    return {};
  }

  const workspace = readEnvInput(env.GITHUB_WORKSPACE) ?? process.cwd();
  const resolvedPath = isAbsolute(configPath) ? configPath : join(workspace, configPath);
  const parsed = await loadActionConfigValue(configPath, resolvedPath);
  const result = validateClarissimiConfig(parsed);
  if (!result.ok) {
    throw new ActionUsageError(formatActionConfigValidationIssue(result.issues[0]));
  }

  return result.value;
}

export function resolveActionMarkdownSummary(
  env: NodeJS.ProcessEnv,
  config: ClarissimiConfig,
): NonNullable<ClarissimiConfig["markdownSummary"]> {
  const value = readEnvInput(env.INPUT_MARKDOWN_SUMMARY) ?? config.markdownSummary ?? "none";
  if (!isConfigMarkdownSummary(value)) {
    throw new ActionUsageError("INPUT_MARKDOWN_SUMMARY supports only none, table, or gallery.");
  }

  return value;
}

export function resolveActionIncludeAutomationContributors(
  env: NodeJS.ProcessEnv,
  config: ClarissimiConfig,
): boolean {
  const value = readEnvInput(env.INPUT_INCLUDE_AUTOMATION_CONTRIBUTORS);
  if (value === undefined) {
    return config.includeAutomationContributors ?? true;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ActionUsageError("INPUT_INCLUDE_AUTOMATION_CONTRIBUTORS supports only true or false.");
}

async function loadActionConfigValue(configPath: string, resolvedPath: string): Promise<unknown> {
  if (resolvedPath.endsWith(".json")) {
    try {
      return JSON.parse(await readFile(resolvedPath, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ActionUsageError(`Invalid JSON in Action config ${configPath}.`);
      }

      throw new ActionUsageError(`Unable to read Action config ${configPath}.`);
    }
  }

  if (basename(configPath.replaceAll("\\", "/")) === "clarissimi.config.ts") {
    let module;
    try {
      module = await import(pathToFileURL(resolvedPath).href);
    } catch {
      throw new ActionUsageError(`Failed to load TypeScript Action config ${configPath}.`);
    }

    if (!("default" in module)) {
      throw new ActionUsageError(
        `TypeScript Action config ${configPath} must export a default config object.`,
      );
    }

    return module.default;
  }

  throw new ActionUsageError(
    "Action config-path must point to a JSON config file or clarissimi.config.ts.",
  );
}

function formatActionConfigValidationIssue(issue: ValidationIssue | undefined): string {
  if (issue === undefined) {
    return "Action config is invalid.";
  }

  if (issue.path === "$" && issue.code === "expected_object") {
    return "Action config must be an object.";
  }

  const field = issue.path.startsWith("$.") ? issue.path.slice(2) : issue.path;
  if (issue.code === "invalid_enum") {
    return `Action config field ${field} has an unsupported value.`;
  }

  if (issue.code === "empty_string") {
    return `Action config field ${field} must be a non-empty string.`;
  }

  return issue.message;
}
