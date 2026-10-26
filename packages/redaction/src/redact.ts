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

const SENSITIVE_KEYS = [
  "api_key",
  "authorization",
  "client_secret",
  "cookie",
  "password",
  "private_key",
  "refresh_token",
  "set_cookie",
  "signature",
  "token",
  "access_token",
  "secret",
] as const;
const SENSITIVE_KEY_SOURCE = SENSITIVE_KEYS.map((key) => key.replaceAll("_", "[_-]?")).join("|");
const SENSITIVE_JSON_KEY = new RegExp(`^(?:${SENSITIVE_KEY_SOURCE})$`, "i");

const REDACTION_RULES: readonly RedactionRule[] = [
  {
    kind: "github_token",
    pattern: /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{16,}\b/g,
  },
  {
    kind: "openai_token",
    pattern: /\bsk-(?:proj|live|test|admin|user|org|svc|key)-[A-Za-z0-9_-]{12,}\b/g,
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
      /["']?\b(?:[A-Z][A-Z0-9_]*_)?(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY)\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^"'\s]+)["']?/g,
  },
  {
    kind: "generic_secret_assignment",
    pattern: new RegExp(
      String.raw`["']?\b(?:${SENSITIVE_KEY_SOURCE})["']?\s*[:=]\s*` +
        /(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^"'`\s]{8,})["']?/.source,
      "gi",
    ),
  },
];

export function redactText(input: string): RedactedText {
  const occurrences: RedactionOccurrence[] = [];
  let text = redactPrivateKeyBlocks(input, occurrences);

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
  text = redactEmailAddresses(text, occurrences);

  return {
    text,
    report: buildReport(occurrences),
  };
}

function redactPrivateKeyBlocks(input: string, occurrences: RedactionOccurrence[]): string {
  const begin = /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g;
  const end = /-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g;
  const parts: string[] = [];
  let offset = 0;

  for (let match = begin.exec(input); match !== null; match = begin.exec(input)) {
    end.lastIndex = begin.lastIndex;
    // An incomplete block still contains key material. Mask its entire suffix in
    // one pass, including nested BEGIN markers, without rescanning that suffix.
    const blockEnd = end.exec(input) === null ? input.length : end.lastIndex;
    parts.push(input.slice(offset, match.index), REDACTION_PLACEHOLDER);
    occurrences.push({
      kind: "private_key_block",
      replacement: REDACTION_PLACEHOLDER,
      start: match.index,
      end: blockEnd,
    });
    offset = blockEnd;
    begin.lastIndex = offset;
  }
  if (parts.length === 0) {
    return input;
  }
  parts.push(input.slice(offset));
  return parts.join("");
}

function redactEmailAddresses(input: string, occurrences: RedactionOccurrence[]): string {
  const localParts = /[A-Z0-9._%+-]+/gi;
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iy;
  const parts: string[] = [];
  let end = 0;

  for (let token = localParts.exec(input); token !== null; token = localParts.exec(input)) {
    if (input[localParts.lastIndex] !== "@") {
      continue;
    }
    // Try only the first word boundary in this maximal local part. A failed domain
    // cannot match from any later boundary in the same token; retrying is quadratic.
    // After a prior match, punctuation can itself begin at a word boundary.
    const previousIsWord = /\w/.test(input[token.index - 1] ?? "");
    const boundary = token[0].search(previousIsWord ? /\W/ : /\w/);
    if (boundary === -1) {
      continue;
    }
    email.lastIndex = token.index + boundary;
    const match = email.exec(input);
    if (match === null) {
      continue;
    }

    parts.push(input.slice(end, match.index), REDACTION_PLACEHOLDER);
    occurrences.push({
      kind: "email",
      replacement: REDACTION_PLACEHOLDER,
      start: match.index,
      end: email.lastIndex,
    });
    end = email.lastIndex;
    localParts.lastIndex = end;
  }
  if (parts.length === 0) {
    return input;
  }
  parts.push(input.slice(end));
  return parts.join("");
}

export function redactJson<T extends RedactableJson>(input: T): RedactedJson<T> {
  const occurrences: RedactionOccurrence[] = [];
  const value = redactJsonValue(input, occurrences) as T;

  return {
    value,
    report: buildReport(occurrences),
  };
}

export function mergeRedactionReports(reports: readonly RedactionReport[]): RedactionReport {
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
      Object.entries(value).map(([key, entry]) => {
        if (isSensitiveJsonKey(key)) {
          occurrences.push({
            kind: "sensitive_json_key",
            replacement: REDACTION_PLACEHOLDER,
            start: 0,
            end: typeof entry === "string" ? entry.length : 0,
          });
          return [key, REDACTION_PLACEHOLDER];
        }

        return [key, redactJsonValue(entry, occurrences)];
      }),
    );
  }

  return value;
}

function isSensitiveJsonKey(key: string): boolean {
  return SENSITIVE_JSON_KEY.test(key.trim());
}

function buildReport(occurrences: readonly RedactionOccurrence[]): RedactionReport {
  return {
    changed: occurrences.length > 0,
    occurrences,
  };
}
