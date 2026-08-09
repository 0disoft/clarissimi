import { RendererValidationError } from "./types.js";

const SENSITIVE_URL_PARAMETER_PATTERN =
  /(?:^|[_-])(?:access[_-]?token|auth[_-]?token|token|secret|password|api[_-]?key|private[_-]?key)(?:$|[=_-])/i;

export function normalizeSafeHttpsUrl(
  value: string,
  path: string,
  surface: "HTML" | "Markdown",
): string {
  const encoded = [...value]
    .map((character) =>
      shouldEncodeUrlCharacter(character) ? encodeURIComponent(character) : character,
    )
    .join("");

  let parsed: URL;
  try {
    parsed = new URL(encoded);
  } catch {
    throw new RendererValidationError(`${surface} link destination must be a valid HTTPS URL.`, [
      {
        path,
        code: "invalid_url",
        message: `Rendered ${surface} links require a valid HTTPS URL.`,
      },
    ]);
  }

  if (parsed.protocol !== "https:") {
    throw new RendererValidationError(`${surface} link destination must use HTTPS.`, [
      {
        path,
        code: "invalid_url_protocol",
        message: `Rendered ${surface} links require HTTPS.`,
      },
    ]);
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new RendererValidationError(
      `${surface} link destination must not include URL credentials.`,
      [
        {
          path,
          code: "invalid_url_userinfo",
          message: `Rendered ${surface} links must not include a URL username or password.`,
        },
      ],
    );
  }

  const sensitiveParameter = [...parsed.searchParams.keys()].find((name) =>
    SENSITIVE_URL_PARAMETER_PATTERN.test(name),
  );
  if (
    sensitiveParameter !== undefined ||
    SENSITIVE_URL_PARAMETER_PATTERN.test(parsed.hash.slice(1))
  ) {
    throw new RendererValidationError(
      `${surface} link destination must not include secret-bearing URL parameters.`,
      [
        {
          path,
          code: "unsafe_url_parameter",
          message: `Rendered ${surface} links must not include credential-like query or fragment data.`,
        },
      ],
    );
  }

  return parsed.href;
}

function shouldEncodeUrlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint <= 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    /\s/u.test(character) ||
    character === "\\"
  );
}
