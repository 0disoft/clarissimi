import {
  REDACTION_PLACEHOLDER,
  type RedactableJson,
  type RedactedJson,
  type RedactedText,
  type RedactionKind,
  type RedactionOccurrence,
  type RedactionReport,
} from "./types.js";

interface RedactionRule {
  readonly kind: RedactionKind;
  readonly pattern: RegExp;
}

const REDACTION_RULES: readonly RedactionRule[] = [
  {
    kind: "private_key_block",
    pattern:
      /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    kind: "github_token",
    pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{16,}\b/g,
  },
  {
    kind: "openai_token",
    pattern:
      /\bsk-(?:proj|live|test|admin|user|org|svc|key)-[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    kind: "anthropic_token",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    kind: "gemini_token",
    pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: "env_assignment",
    pattern:
      /\b(?:[A-Z][A-Z0-9_]*_)?(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY)\s*=\s*["']?[^"'\s]+["']?/g,
  },
  {
    kind: "generic_secret_assignment",
    pattern:
      /\b(?:token|secret|password|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/gi,
  },
  {
    kind: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
];

export function redactText(input: string): RedactedText {
  const occurrences: RedactionOccurrence[] = [];
  let text = input;

  for (const rule of REDACTION_RULES) {
    text = text.replace(rule.pattern, (match, offset: number) => {
      occurrences.push({
        kind: rule.kind,
        replacement: REDACTION_PLACEHOLDER,
        start: offset,
        end: offset + match.length,
      });

      return REDACTION_PLACEHOLDER;
    });
  }

  return {
    text,
    report: buildReport(occurrences),
  };
}

export function redactJson<T extends RedactableJson>(
  input: T,
): RedactedJson<T> {
  const occurrences: RedactionOccurrence[] = [];
  const value = redactJsonValue(input, occurrences) as T;

  return {
    value,
    report: buildReport(occurrences),
  };
}

export function mergeRedactionReports(
  reports: readonly RedactionReport[],
): RedactionReport {
  const occurrences = reports.flatMap((report) => report.occurrences);
  return buildReport(occurrences);
}

function redactJsonValue(
  value: RedactableJson,
  occurrences: RedactionOccurrence[],
): RedactableJson {
  if (typeof value === "string") {
    const redacted = redactText(value);
    occurrences.push(...redacted.report.occurrences);
    return redacted.text;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry, occurrences));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactJsonValue(entry, occurrences),
      ]),
    );
  }

  return value;
}

function buildReport(
  occurrences: readonly RedactionOccurrence[],
): RedactionReport {
  return {
    changed: occurrences.length > 0,
    occurrences,
  };
}
