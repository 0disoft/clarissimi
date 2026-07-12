import {
  ASSESSMENT_SCHEMA_VERSION,
  CONTRIBUTION_TYPES,
  IMPACT_LEVELS,
  validateContributionAssessment,
  type ContributionAssessment,
  type ValidationIssue,
} from "@clarissimi/schemas";

import type { ContributionDraftProvider, ProviderAssessmentInput } from "./types.js";

const DEFAULT_PROVIDER_ID = "openai-compatible";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const THINKING_TYPES = ["disabled"] as const;

export type OpenAiCompatibleThinkingType = (typeof THINKING_TYPES)[number];

export type OpenAiCompatibleProviderErrorCode =
  | "invalid_options"
  | "http_error"
  | "network_error"
  | "timeout"
  | "response_too_large"
  | "invalid_response"
  | "invalid_json"
  | "invalid_assessment";

export interface OpenAiCompatibleProviderOptions {
  readonly id?: string;
  readonly endpoint?: string;
  readonly model: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly thinking?: OpenAiCompatibleThinkingType;
}

export class OpenAiCompatibleProviderError extends Error {
  readonly code: OpenAiCompatibleProviderErrorCode;
  readonly retryable: boolean;
  readonly issues?: readonly ValidationIssue[];

  constructor(
    code: OpenAiCompatibleProviderErrorCode,
    message: string,
    issues?: readonly ValidationIssue[],
    retryable = false,
  ) {
    super(message);
    this.name = "OpenAiCompatibleProviderError";
    this.code = code;
    this.retryable = retryable;
    if (issues !== undefined) {
      this.issues = issues;
    }
  }
}

export function createOpenAiCompatibleContributionDraftProvider(
  options: OpenAiCompatibleProviderOptions,
): ContributionDraftProvider {
  const endpoint = parseEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
  const model = nonEmptyOption(options.model, "model");
  const token = nonEmptyOption(options.token, "token");
  const fetchImpl = options.fetch ?? fetch;
  const temperature = finiteNumberOption(options.temperature ?? DEFAULT_TEMPERATURE, "temperature");
  const maxTokens = positiveIntegerOption(options.maxTokens ?? DEFAULT_MAX_TOKENS, "maxTokens");
  const timeoutMs = positiveIntegerOption(
    options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    "timeoutMs",
  );
  const maxResponseBytes = positiveIntegerOption(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    "maxResponseBytes",
  );
  const thinking = optionalEnumOption(options.thinking, THINKING_TYPES, "thinking");

  return {
    id: options.id ?? DEFAULT_PROVIDER_ID,
    async createAssessment(input: ProviderAssessmentInput): Promise<ContributionAssessment> {
      const requestInput = {
        endpoint,
        model,
        token,
        fetchImpl,
        temperature,
        maxTokens,
        timeoutMs,
        maxResponseBytes,
        input,
        ...(thinking === undefined ? {} : { thinking }),
      } satisfies RequestAssessmentDraftInput;

      const content = await requestAssessmentDraft(requestInput);
      return parseAssessmentDraft(content, input);
    },
  };
}

interface RequestAssessmentDraftInput {
  readonly endpoint: URL;
  readonly model: string;
  readonly token: string;
  readonly fetchImpl: typeof fetch;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly thinking?: OpenAiCompatibleThinkingType;
  readonly input: ProviderAssessmentInput;
}

async function requestAssessmentDraft(options: RequestAssessmentDraftInput): Promise<string> {
  const requestBody: Record<string, unknown> = {
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: JSON.stringify(buildProviderPayload(options.input)),
      },
    ],
  };

  if (options.thinking !== undefined) {
    requestBody.thinking = {
      type: options.thinking,
    };
  }

  let response: Response;
  let text: string;
  try {
    ({ response, text } = await withTimeout(options.timeoutMs, async (signal) => {
      const result = await options.fetchImpl(options.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal,
      });
      return {
        response: result,
        text: await readBoundedResponseText(result, options.maxResponseBytes),
      };
    }));
  } catch (error) {
    if (error instanceof OpenAiCompatibleProviderError) {
      throw error;
    }
    if (error instanceof RequestTimeoutError) {
      throw providerTransportError(
        "timeout",
        "OpenAI-compatible provider request timed out.",
        true,
      );
    }
    throw providerTransportError(
      "network_error",
      "OpenAI-compatible provider request failed before a response.",
      true,
    );
  }

  if (!response.ok) {
    throw providerTransportError(
      "http_error",
      `OpenAI-compatible provider request failed with status ${response.status}.`,
      response.status === 429 || response.status >= 500,
    );
  }

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(text) as unknown;
  } catch {
    throw new OpenAiCompatibleProviderError(
      "invalid_response",
      "OpenAI-compatible provider returned a non-JSON response.",
    );
  }

  return extractMessageContent(responseBody);
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new OpenAiCompatibleProviderError(
        "response_too_large",
        `OpenAI-compatible provider response exceeded ${maxBytes} bytes.`,
      );
    }
  }

  if (response.body === null || response.body === undefined) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new OpenAiCompatibleProviderError(
        "response_too_large",
        `OpenAI-compatible provider response exceeded ${maxBytes} bytes.`,
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return text + decoder.decode();
      }
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new OpenAiCompatibleProviderError(
          "response_too_large",
          `OpenAI-compatible provider response exceeded ${maxBytes} bytes.`,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function withTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

class RequestTimeoutError extends Error {}

function providerTransportError(
  code: OpenAiCompatibleProviderErrorCode,
  message: string,
  retryable: boolean,
): OpenAiCompatibleProviderError {
  return new OpenAiCompatibleProviderError(code, message, undefined, retryable);
}

function buildSystemPrompt(): string {
  return [
    "You are Clarissimi's contribution recognition drafter.",
    "You are not a judge and must not approve, reject, rank, score, or compare contributors.",
    "Return only JSON with these fields:",
    "contributionType, affectedArea, impactLevel, evidenceSummary, suggestedBadge, publicRecognitionText, confidence.",
    `contributionType must be one of: ${CONTRIBUTION_TYPES.join(", ")}.`,
    `impactLevel must be one of: ${IMPACT_LEVELS.join(", ")}.`,
    "confidence must be a number between 0 and 1.",
    "Base every claim on the provided redacted evidence. Do not invent evidence.",
    "Do not include raw provider output, raw diffs, secrets, leaderboard language, rankings, numeric contributor scores, score shares, point shares, impact-weight shares, contribution-weight shares, or recent time-window contribution percentages.",
    "Do not wrap the JSON object in Markdown code fences.",
  ].join("\n");
}

function buildProviderPayload(input: ProviderAssessmentInput): Record<string, unknown> {
  return {
    contributor: input.contributor,
    source: input.preparedEvidence.source,
    evidenceRefs: input.preparedEvidence.evidenceRefs,
    evidenceItems: input.preparedEvidence.items.map((item) => ({
      kind: item.kind,
      id: item.id,
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      text: item.text,
      metadata: item.metadata,
    })),
    redaction: {
      changed: input.preparedEvidence.redactionReport.changed,
      matchCount: input.preparedEvidence.redactionReport.occurrences.length,
    },
    hints: input.hints ?? {},
  };
}

function parseAssessmentDraft(
  content: string,
  input: ProviderAssessmentInput,
): ContributionAssessment {
  let draft: unknown;
  try {
    draft = JSON.parse(normalizeJsonObjectContent(content)) as unknown;
  } catch {
    throw new OpenAiCompatibleProviderError(
      "invalid_json",
      "OpenAI-compatible provider returned message content that was not JSON.",
    );
  }

  if (!isRecord(draft)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_json",
      "OpenAI-compatible provider draft must be a JSON object.",
    );
  }

  const assessment = {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    contributor: input.contributor,
    contributionType: draft.contributionType,
    affectedArea: draft.affectedArea,
    impactLevel: draft.impactLevel,
    evidenceSummary: draft.evidenceSummary,
    evidenceRefs: input.preparedEvidence.evidenceRefs,
    suggestedBadge: draft.suggestedBadge,
    publicRecognitionText: draft.publicRecognitionText,
    confidence: draft.confidence,
    maintainerApprovalStatus: "draft",
    source: input.preparedEvidence.source,
  };

  const result = validateContributionAssessment(assessment);
  if (!result.ok) {
    throw new OpenAiCompatibleProviderError(
      "invalid_assessment",
      "OpenAI-compatible provider produced an invalid contribution assessment.",
      result.issues,
    );
  }

  return result.value;
}

function normalizeJsonObjectContent(content: string): string {
  const trimmed = content.trim();
  const fencedJsonMatch = /^```(?:json)?\s*\r?\n(?<json>[\s\S]*?)\r?\n```$/i.exec(trimmed);
  return fencedJsonMatch?.groups?.json?.trim() ?? trimmed;
}

function extractMessageContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_response",
      "OpenAI-compatible provider response must include choices.",
    );
  }

  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_response",
      "OpenAI-compatible provider response must include a message.",
    );
  }

  const content = first.message.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text.length > 0) {
      return text;
    }
  }

  throw new OpenAiCompatibleProviderError(
    "invalid_response",
    "OpenAI-compatible provider message content must be non-empty text.",
  );
}

function parseEndpoint(value: string): URL {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      "OpenAI-compatible provider endpoint must be non-empty.",
    );
  }

  try {
    const endpoint = new URL(normalized);
    if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    return endpoint;
  } catch {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      "OpenAI-compatible provider endpoint must be an HTTP(S) URL.",
    );
  }
}

function nonEmptyOption(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} must be non-empty.`,
    );
  }

  return normalized;
}

function finiteNumberOption(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} must be a finite number.`,
    );
  }

  return value;
}

function positiveIntegerOption(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} must be a positive integer.`,
    );
  }

  return value;
}

function optionalEnumOption<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!(allowed as readonly string[]).includes(value)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} has an unsupported value.`,
    );
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
