import { redactText } from "@clarissimi/redaction";
import type { ContributionAssessment, ValidationIssue } from "@clarissimi/schemas";

const SENSITIVE_URL_PARAMETER_PATTERN =
  /(?:^|[_-])(?:access[_-]?token|auth[_-]?token|token|secret|password|api[_-]?key|private[_-]?key)(?:$|[=_-])/i;
const MAX_URL_DECODE_LAYERS = 6;
const ENCODED_BYTE_PATTERN = /%[0-9a-f]{2}/i;

interface RepositoryTextField {
  readonly path: string;
  readonly value: string | undefined;
  readonly url?: boolean;
}

interface UnsafeMatch {
  readonly code: string;
  readonly kind: string;
}

export function isSensitiveUrlParameterName(name: string): boolean {
  const decoded = decodeNestedUrlComponent(name);
  return decoded === undefined || SENSITIVE_URL_PARAMETER_PATTERN.test(decoded);
}

export function findUnsafeRepositoryAssessmentFields(
  assessment: ContributionAssessment,
): readonly ValidationIssue[] {
  const fields: RepositoryTextField[] = [
    { path: "$.contributor.id", value: assessment.contributor.id },
    { path: "$.contributor.login", value: assessment.contributor.login },
    { path: "$.contributor.profileUrl", value: assessment.contributor.profileUrl, url: true },
    { path: "$.affectedArea", value: assessment.affectedArea },
    { path: "$.evidenceSummary", value: assessment.evidenceSummary },
    { path: "$.suggestedBadge", value: assessment.suggestedBadge },
    { path: "$.publicRecognitionText", value: assessment.publicRecognitionText },
    { path: "$.source.repository", value: assessment.source.repository },
  ];
  assessment.evidenceRefs.forEach((ref, index) => {
    fields.push(
      { path: `$.evidenceRefs[${index}].id`, value: ref.id },
      { path: "$.evidenceRefs[].url", value: ref.url, url: true },
      { path: `$.evidenceRefs[${index}].title`, value: ref.title },
    );
  });

  const issues: ValidationIssue[] = [];
  for (const field of fields) {
    if (field.value === undefined) {
      continue;
    }
    const match = findSensitiveTextKind(field.value, field.url === true);
    if (match !== undefined) {
      issues.push({
        path: field.path,
        code: match.code,
        message: `Repository-visible content contains ${match.kind}; edit the assessment before writing it.`,
      });
    }
  }
  return issues;
}

function findSensitiveTextKind(value: string, url: boolean): UnsafeMatch | undefined {
  if (!url) {
    return findDirectSensitiveText(value);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return findDirectSensitiveText(value, false);
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { code: "invalid_url_userinfo", kind: "URL credentials" };
  }
  for (const [name, parameterValue] of parsed.searchParams) {
    const decodedName = decodeNestedUrlComponent(name);
    const decodedValue = decodeNestedUrlComponent(parameterValue);
    if (decodedName === undefined || decodedValue === undefined) {
      return { code: "invalid_url_encoding", kind: "an invalid URL encoding" };
    }
    if (isSensitiveUrlParameterName(decodedName)) {
      return { code: "unsafe_url_parameter", kind: "a sensitive URL parameter" };
    }
    const kind = redactText(`${decodedName}=${decodedValue}`).report.occurrences[0]?.kind;
    if (kind !== undefined) {
      return { code: "unsafe_repository_text", kind };
    }
  }
  const direct = findDirectSensitiveText(value, false);
  if (direct !== undefined) {
    return direct;
  }
  for (const encodedPart of [parsed.pathname, parsed.hash]) {
    const decoded = decodeNestedUrlComponent(encodedPart);
    if (decoded === undefined) {
      return { code: "invalid_url_encoding", kind: "an invalid URL encoding" };
    }
    const kind = redactText(decoded).report.occurrences[0]?.kind;
    if (kind !== undefined) {
      return { code: "unsafe_repository_text", kind };
    }
    if (encodedPart === parsed.hash) {
      const fragment = decoded.slice(1);
      if (
        isSensitiveUrlParameterName(fragment) ||
        fragment
          .split(/[?&/]/)
          .some((part) => part.includes("=") && isSensitiveUrlParameterName(part.split("=")[0]))
      ) {
        return { code: "unsafe_url_parameter", kind: "a sensitive URL fragment" };
      }
    }
  }
  return undefined;
}

function decodeNestedUrlComponent(value: string): string | undefined {
  let decoded = value;
  for (
    let layer = 0;
    layer < MAX_URL_DECODE_LAYERS && ENCODED_BYTE_PATTERN.test(decoded);
    layer += 1
  ) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return undefined;
    }
  }
  return ENCODED_BYTE_PATTERN.test(decoded) ? undefined : decoded;
}

function findDirectSensitiveText(value: string, scanEmbeddedUrls = true): UnsafeMatch | undefined {
  const kind = redactText(value).report.occurrences[0]?.kind;
  if (kind !== undefined) {
    return { code: "unsafe_repository_text", kind };
  }
  if (scanEmbeddedUrls) {
    for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const unsafeUrl = findSensitiveTextKind(match[0], true);
      if (unsafeUrl !== undefined) {
        return unsafeUrl;
      }
    }
  }
  return undefined;
}
