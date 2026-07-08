import { canPublishAssessment } from "@clarissimi/core";
import type { ContributionAssessment, ValidationIssue } from "@clarissimi/schemas";

import { RendererValidationError, type PublicContributionRecord } from "./types.js";

export function toPublicContributionRecord(value: unknown): PublicContributionRecord {
  const result = canPublishAssessment(value);

  if (!result.ok) {
    throw new RendererValidationError(
      "Only valid approved assessments can be rendered as public contribution records.",
      result.issues
    );
  }

  return result.value.assessment;
}

export function toPublicContributionRecords(
  values: readonly unknown[]
): readonly PublicContributionRecord[] {
  return values.map(toPublicContributionRecord);
}

export function renderContributionsJsonl(values: readonly unknown[]): string {
  const records = toPublicContributionRecords(values);
  if (records.length === 0) {
    return "";
  }

  return `${records.map((record) => stableStringify(record)).join("\n")}\n`;
}

export function parseContributionsJsonl(input: string): readonly PublicContributionRecord[] {
  const records: PublicContributionRecord[] = [];

  input.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new RendererValidationError("Ledger JSONL contains an invalid JSON line.", [
        {
          path: `$[${index}]`,
          code: "invalid_json",
          message: "Ledger line must be valid JSON."
        }
      ]);
    }

    records.push(toPublicContributionRecord(parsed));
  });

  return records;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function renderPrettyJson(value: unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = sortJsonValue(value[key]);
      });
    return sorted;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
