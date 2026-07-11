import {
  mergeRedactionReports,
  redactJson,
  redactText,
  type RedactableJson,
  type RedactionReport,
} from "@clarissimi/redaction";
import type {
  EvidenceKind,
  EvidenceRef,
  RecognitionSource,
} from "@clarissimi/schemas";

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

export function prepareEvidenceForProvider(
  input: EvidenceBundleInput,
): PreparedProviderEvidence {
  const items = input.items.map(prepareEvidenceItem);
  const redactionReport = mergeRedactionReports(
    items.map((item) => item.redactionReport),
  );

  return {
    source: input.source,
    items,
    evidenceRefs: items.map(toEvidenceRef),
    redactionReport,
  };
}

function prepareEvidenceItem(input: EvidenceItemInput): PreparedEvidenceItem {
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
