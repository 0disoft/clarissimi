import {
  mergeRedactionReports,
  redactJson,
  redactText,
  type RedactableJson,
  type RedactionReport,
} from "@clarissimi/redaction";
import type { EvidenceKind, EvidenceRef, RecognitionSource } from "@clarissimi/schemas";

export interface EvidenceItemInput {
  readonly kind: EvidenceKind;
  readonly id: string;
  readonly url?: string;
  readonly title?: string;
  readonly excerpt?: string;
  readonly text?: string;
  readonly metadata?: RedactableJson;
}

export interface EvidenceBundleInput {
  readonly source: RecognitionSource;
  readonly items: readonly EvidenceItemInput[];
}

export interface PreparedEvidenceItem {
  readonly kind: EvidenceKind;
  readonly id: string;
  readonly url?: string;
  readonly title?: string;
  readonly excerpt?: string;
  readonly text?: string;
  readonly metadata?: RedactableJson;
  readonly redactionReport: RedactionReport;
}

export interface PreparedProviderEvidence {
  readonly source: RecognitionSource;
  readonly items: readonly PreparedEvidenceItem[];
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly redactionReport: RedactionReport;
}

export const PROVIDER_EVIDENCE_LIMITS = {
  maxItems: 256,
  maxUtf8Bytes: 512 * 1024,
} as const;

export type EvidencePreparationErrorCode =
  | "evidence_item_limit"
  | "evidence_bytes_limit"
  | "unsafe_structural_field";

export class EvidencePreparationError extends Error {
  readonly code: EvidencePreparationErrorCode;

  constructor(code: EvidencePreparationErrorCode, message: string) {
    super(message);
    this.name = "EvidencePreparationError";
    this.code = code;
  }
}

export function prepareEvidenceForProvider(input: EvidenceBundleInput): PreparedProviderEvidence {
  assertEvidenceItemCount(input.items.length);
  const items = input.items.map(prepareEvidenceItem);
  const redactionReport = mergeRedactionReports(items.map((item) => item.redactionReport));
  const prepared = {
    source: input.source,
    items,
    evidenceRefs: items.map(toEvidenceRef),
    redactionReport,
  };

  assertPreparedEvidenceForProvider(prepared);
  return prepared;
}

export function assertPreparedEvidenceForProvider(evidence: PreparedProviderEvidence): void {
  assertEvidenceItemCount(evidence.items.length);
  for (const [index, item] of evidence.items.entries()) {
    assertSafeStructuralField(item.id, `items[${index}].id`);
    if (item.url !== undefined) {
      assertSafeStructuralField(item.url, `items[${index}].url`);
    }
  }
  for (const [index, ref] of evidence.evidenceRefs.entries()) {
    assertSafeStructuralField(ref.id, `evidenceRefs[${index}].id`);
    if (ref.url !== undefined) {
      assertSafeStructuralField(ref.url, `evidenceRefs[${index}].url`);
    }
  }

  const bytes = new TextEncoder().encode(
    JSON.stringify({
      source: evidence.source,
      items: evidence.items.map((item) => ({
        kind: item.kind,
        id: item.id,
        url: item.url,
        title: item.title,
        excerpt: item.excerpt,
        text: item.text,
        metadata: item.metadata,
      })),
      evidenceRefs: evidence.evidenceRefs,
    }),
  ).byteLength;
  if (bytes > PROVIDER_EVIDENCE_LIMITS.maxUtf8Bytes) {
    throw new EvidencePreparationError(
      "evidence_bytes_limit",
      `Prepared provider evidence must not exceed ${PROVIDER_EVIDENCE_LIMITS.maxUtf8Bytes} UTF-8 bytes.`,
    );
  }
}

function prepareEvidenceItem(input: EvidenceItemInput): PreparedEvidenceItem {
  assertSafeStructuralField(input.id, "item.id");
  if (input.url !== undefined) {
    assertSafeStructuralField(input.url, "item.url");
  }

  const reports: RedactionReport[] = [];
  const title = redactOptionalText(input.title, reports);
  const excerpt = redactOptionalText(input.excerpt, reports);
  const text = redactOptionalText(input.text, reports);
  const metadata = redactOptionalJson(input.metadata, reports);

  const item: PreparedEvidenceItem = {
    kind: input.kind,
    id: input.id,
    redactionReport: mergeRedactionReports(reports),
  };

  assignOptional(item, "url", input.url);
  assignOptional(item, "title", title);
  assignOptional(item, "excerpt", excerpt);
  assignOptional(item, "text", text);
  assignOptional(item, "metadata", metadata);

  return item;
}

function assertEvidenceItemCount(count: number): void {
  if (count > PROVIDER_EVIDENCE_LIMITS.maxItems) {
    throw new EvidencePreparationError(
      "evidence_item_limit",
      `Prepared provider evidence must not exceed ${PROVIDER_EVIDENCE_LIMITS.maxItems} items.`,
    );
  }
}

function assertSafeStructuralField(value: string, field: string): void {
  if (redactText(value).report.changed) {
    throw new EvidencePreparationError(
      "unsafe_structural_field",
      `Prepared provider evidence ${field} contains secret-bearing data.`,
    );
  }
}

function toEvidenceRef(item: PreparedEvidenceItem): EvidenceRef {
  const ref: EvidenceRef = {
    kind: item.kind,
    id: item.id,
  };

  assignOptional(ref, "url", item.url);
  assignOptional(ref, "title", item.title);
  assignOptional(ref, "excerpt", item.excerpt ?? item.text);

  return ref;
}

function redactOptionalText(
  value: string | undefined,
  reports: RedactionReport[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const result = redactText(value);
  reports.push(result.report);
  return result.text;
}

function redactOptionalJson(
  value: RedactableJson | undefined,
  reports: RedactionReport[],
): RedactableJson | undefined {
  if (value === undefined) {
    return undefined;
  }

  const result = redactJson(value);
  reports.push(result.report);
  return result.value;
}

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
