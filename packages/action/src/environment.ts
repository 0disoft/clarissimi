import { ActionUsageError } from "./errors.js";

export function readEnvInput(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

export function requireEnvInput(value: string | undefined, name: string): string {
  const normalized = readEnvInput(value);
  if (normalized === undefined) {
    throw new ActionUsageError(`${name} is required for write modes.`);
  }

  return normalized;
}
