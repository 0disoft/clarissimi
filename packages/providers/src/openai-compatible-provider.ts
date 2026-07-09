import {
  ASSESSMENT_SCHEMA_VERSION,
  CONTRIBUTION_TYPES,
  IMPACT_LEVELS,
  validateContributionAssessment,
  type ContributionAssessment,
  type ValidationIssue
} from "@clarissimi/schemas";

import type {
  ContributionDraftProvider,
  ProviderAssessmentInput
} from "./types.js";

const DEFAULT_PROVIDER_ID = "openai-compatible";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 1200;

export type OpenAiCompatibleProviderErrorCode =
  | "invalid_options"
  | "http_error"
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
}

export class OpenAiCompatibleProviderError extends Error {
  readonly code: OpenAiCompatibleProviderErrorCode;
  readonly issues?: readonly ValidationIssue[];

  constructor(
    code: OpenAiCompatibleProviderErrorCode,
    message: string,
    issues?: readonly ValidationIssue[]
  ) {
    super(message);
    this.name = "OpenAiCompatibleProviderError";
    this.code = code;
    if (issues !== undefined) {
      this.issues = issues;
    }
  }
}

export function createOpenAiCompatibleContributionDraftProvider(
  options: OpenAiCompatibleProviderOptions
): ContributionDraftProvider {
  const endpoint = parseEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
  const model = nonEmptyOption(options.model, "model");
  const token = nonEmptyOption(options.token, "token");
  const fetchImpl = options.fetch ?? fetch;
  const temperature = finiteNumberOption(options.temperature ?? DEFAULT_TEMPERATURE, "temperature");
  const maxTokens = positiveIntegerOption(options.maxTokens ?? DEFAULT_MAX_TOKENS, "maxTokens");

  return {
    id: options.id ?? DEFAULT_PROVIDER_ID,
    async createAssessment(input: ProviderAssessmentInput): Promise<ContributionAssessment> {
      const content = await requestAssessmentDraft({
        endpoint,
        model,
        token,
        fetchImpl,
        temperature,
        maxTokens,
        input
      });
      return parseAssessmentDraft(content, input);
    }
  };
}

interface RequestAssessmentDraftInput {
  readonly endpoint: URL;
  readonly model: string;
  readonly token: string;
  readonly fetchImpl: typeof fetch;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly input: ProviderAssessmentInput;
}

async function requestAssessmentDraft(options: RequestAssessmentDraftInput): Promise<string> {
  const response = await options.fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify(buildProviderPayload(options.input))
        }
      ]
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new OpenAiCompatibleProviderError(
      "http_error",
      `OpenAI-compatible provider request failed with status ${response.status}.`
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new OpenAiCompatibleProviderError(
      "invalid_response",
      "OpenAI-compatible provider returned a non-JSON response."
    );
  }

  return extractMessageContent(body);
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
    "Do not include raw provider output, raw diffs, secrets, leaderboard language, rankings, or numeric contributor scores."
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
      metadata: item.metadata
    })),
    redaction: {
      changed: input.preparedEvidence.redactionReport.changed,
      matchCount: input.preparedEvidence.redactionReport.occurrences.length
    },
    hints: input.hints ?? {}
  };
}

function parseAssessmentDraft(
  content: string,
  input: ProviderAssessmentInput
): ContributionAssessment {
  let draft: unknown;
  try {
    draft = JSON.parse(content) as unknown;
  } catch {
    throw new OpenAiCompatibleProviderError(
      "invalid_json",
      "OpenAI-compatible provider returned message content that was not JSON."
    );
  }

  if (!isRecord(draft)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_json",
      "OpenAI-compatible provider draft must be a JSON object."
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
    source: input.preparedEvidence.source
  };

  const result = validateContributionAssessment(assessment);
  if (!result.ok) {
    throw new OpenAiCompatibleProviderError(
      "invalid_assessment",
      "OpenAI-compatible provider produced an invalid contribution assessment.",
      result.issues
    );
  }

  return result.value;
}

function extractMessageContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_response",
      "OpenAI-compatible provider response must include choices."
    );
  }

  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_response",
      "OpenAI-compatible provider response must include a message."
    );
  }

  const content = first.message.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
    if (text.length > 0) {
      return text;
    }
  }

  throw new OpenAiCompatibleProviderError(
    "invalid_response",
    "OpenAI-compatible provider message content must be non-empty text."
  );
}

function parseEndpoint(value: string): URL {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      "OpenAI-compatible provider endpoint must be non-empty."
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
      "OpenAI-compatible provider endpoint must be an HTTP(S) URL."
    );
  }
}

function nonEmptyOption(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} must be non-empty.`
    );
  }

  return normalized;
}

function finiteNumberOption(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} must be a finite number.`
    );
  }

  return value;
}

function positiveIntegerOption(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new OpenAiCompatibleProviderError(
      "invalid_options",
      `OpenAI-compatible provider ${name} must be a positive integer.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
