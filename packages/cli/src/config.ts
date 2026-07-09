import {
  validateClarissimiConfig,
  type ClarissimiConfig,
  type ValidationIssue
} from "@clarissimi/schemas";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { fileExists, parseJsonText, readTextFile, resolveFromCwd } from "./io.js";

export type CliConfig = ClarissimiConfig;

const defaultConfigPaths = [
  "clarissimi.config.ts",
  ".clarissimi/config.json"
] as const;

export interface ConfigValidationResult {
  readonly ok: true;
  readonly path?: string;
  readonly config: CliConfig;
}

export async function validateConfigFile(
  cwd: string,
  requestedPath?: string
): Promise<ConfigValidationResult> {
  const path = requestedPath ?? await resolveDefaultConfigPath(cwd);
  if (path === undefined) {
    return {
      ok: true,
      config: {}
    };
  }

  const resolvedPath = resolveFromCwd(cwd, path);

  if (!(await fileExists(resolvedPath))) {
    return {
      ok: true,
      config: {}
    };
  }

  const parsed = await loadConfigValue(path, resolvedPath);
  const result = validateClarissimiConfig(parsed);
  if (!result.ok) {
    throw new Error(formatConfigValidationIssue(result.issues[0]));
  }

  return {
    ok: true,
    path,
    config: result.value
  };
}

async function resolveDefaultConfigPath(cwd: string): Promise<string | undefined> {
  const existing = [];
  for (const path of defaultConfigPaths) {
    if (await fileExists(resolveFromCwd(cwd, path))) {
      existing.push(path);
    }
  }

  if (existing.length > 1) {
    throw new Error(
      `Multiple Clarissimi config files found (${existing.join(", ")}). Pass --config <path> to choose one.`
    );
  }

  return existing[0];
}

async function loadConfigValue(path: string, resolvedPath: string): Promise<unknown> {
  if (resolvedPath.endsWith(".json")) {
    return parseJsonText(await readTextFile(resolvedPath), path);
  }

  if (isSupportedTypeScriptConfigPath(path)) {
    return loadTypeScriptConfig(path, resolvedPath);
  }

  throw new Error("Clarissimi config files must be clarissimi.config.ts or .clarissimi/config.json.");
}

async function loadTypeScriptConfig(path: string, resolvedPath: string): Promise<unknown> {
  let module;
  try {
    module = await import(pathToFileURL(resolvedPath).href);
  } catch {
    throw new Error(`Failed to load TypeScript config ${path}.`);
  }

  if (!("default" in module)) {
    throw new Error(`TypeScript config ${path} must export a default config object.`);
  }

  return module.default;
}

function isSupportedTypeScriptConfigPath(path: string): boolean {
  return basename(path.replaceAll("\\", "/")) === "clarissimi.config.ts";
}

function formatConfigValidationIssue(issue: ValidationIssue | undefined): string {
  if (issue === undefined) {
    return "Clarissimi config is invalid.";
  }

  if (issue.path === "$" && issue.code === "expected_object") {
    return "Clarissimi config must be a JSON object.";
  }

  const field = issue.path.startsWith("$.") ? issue.path.slice(2) : issue.path;
  if (issue.code === "invalid_enum") {
    return `Config field ${field} has an unsupported value.`;
  }

  if (issue.code === "empty_string") {
    return `Config field ${field} must be a non-empty string.`;
  }

  return issue.message;
}
