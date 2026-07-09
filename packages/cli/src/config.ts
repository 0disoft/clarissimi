import {
  validateClarissimiConfig,
  type ClarissimiConfig,
  type ValidationIssue
} from "@clarissimi/schemas";

import { fileExists, parseJsonText, readTextFile, resolveFromCwd } from "./io.js";

export type CliConfig = ClarissimiConfig;

export interface ConfigValidationResult {
  readonly ok: true;
  readonly path?: string;
  readonly config: CliConfig;
}

export async function validateConfigFile(
  cwd: string,
  requestedPath?: string
): Promise<ConfigValidationResult> {
  const path = requestedPath ?? ".clarissimi/config.json";
  const resolvedPath = resolveFromCwd(cwd, path);

  if (!(await fileExists(resolvedPath))) {
    return {
      ok: true,
      config: {}
    };
  }

  if (!resolvedPath.endsWith(".json")) {
    throw new Error("Only .clarissimi/config.json is supported by the fixture-first CLI.");
  }

  const parsed = parseJsonText(await readTextFile(resolvedPath), path);
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
