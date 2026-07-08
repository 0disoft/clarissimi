export const REDACTION_PLACEHOLDER = "[REDACTED]" as const;

export type RedactionKind =
  | "email"
  | "env_assignment"
  | "private_key_block"
  | "github_token"
  | "openai_token"
  | "anthropic_token"
  | "gemini_token"
  | "generic_secret_assignment";

export interface RedactionOccurrence {
  readonly kind: RedactionKind;
  readonly replacement: typeof REDACTION_PLACEHOLDER;
  readonly start: number;
  readonly end: number;
}

export interface RedactionReport {
  readonly changed: boolean;
  readonly occurrences: readonly RedactionOccurrence[];
}

export interface RedactedText {
  readonly text: string;
  readonly report: RedactionReport;
}

export type RedactableJson =
  | null
  | boolean
  | number
  | string
  | readonly RedactableJson[]
  | {
      readonly [key: string]: RedactableJson;
    };

export interface RedactedJson<T extends RedactableJson = RedactableJson> {
  readonly value: T;
  readonly report: RedactionReport;
}
