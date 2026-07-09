import { fileExists, parseJsonText, readTextFile, resolveFromCwd } from "./io.js";

export interface CliConfig {
  readonly provider?: "fake" | "openai-compatible";
  readonly providerEndpoint?: string;
  readonly providerModel?: string;
  readonly providerThinking?: "disabled";
  readonly mode?: "dry-run" | "propose" | "commit";
}

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
  if (!isRecord(parsed)) {
    throw new Error("Clarissimi config must be a JSON object.");
  }

  const config = parseConfig(parsed);

  return {
    ok: true,
    path,
    config
  };
}

function parseConfig(value: Record<string, unknown>): CliConfig {
  const provider = parseOptionalEnum(value.provider, ["fake", "openai-compatible"], "provider");
  const providerEndpoint = parseOptionalString(value.providerEndpoint, "providerEndpoint");
  const providerModel = parseOptionalString(value.providerModel, "providerModel");
  const providerThinking = parseOptionalEnum(value.providerThinking, ["disabled"], "providerThinking");
  const mode = parseOptionalEnum(value.mode, ["dry-run", "propose", "commit"], "mode");
  const config: {
    provider?: "fake" | "openai-compatible";
    providerEndpoint?: string;
    providerModel?: string;
    providerThinking?: "disabled";
    mode?: "dry-run" | "propose" | "commit";
  } = {};

  if (provider !== undefined) {
    config.provider = provider;
  }

  if (providerEndpoint !== undefined) {
    config.providerEndpoint = providerEndpoint;
  }

  if (providerModel !== undefined) {
    config.providerModel = providerModel;
  }

  if (providerThinking !== undefined) {
    config.providerThinking = providerThinking;
  }

  if (mode !== undefined) {
    config.mode = mode;
  }

  return config;
}

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Config field ${field} must be a non-empty string.`);
  }

  return value;
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`Config field ${field} has an unsupported value.`);
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
