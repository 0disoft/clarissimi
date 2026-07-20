import {
  createFakeContributionDraftProvider,
  createOpenAiCompatibleContributionDraftProvider,
  type ContributionDraftProvider,
} from "@clarissimi/providers";
import {
  isConfigProvider,
  isConfigProviderEndpointTrust,
  isConfigProviderThinking,
  type ClarissimiConfig,
  type ConfigProviderEndpointTrust,
  type ConfigProviderThinking,
} from "@clarissimi/schemas";

import { readEnvInput } from "./environment.js";
import { ActionUsageError } from "./errors.js";

export interface ActionProviderRuntime {
  readonly fetch?: typeof fetch;
}

export function resolveActionProvider(
  env: NodeJS.ProcessEnv,
  runtime: ActionProviderRuntime,
  config: ClarissimiConfig,
): ContributionDraftProvider {
  const providerId = readEnvInput(env.INPUT_PROVIDER) ?? config.provider ?? "fake";
  if (!isConfigProvider(providerId)) {
    throw new ActionUsageError(`Unsupported provider: ${providerId}.`);
  }

  if (providerId === "fake") {
    return createFakeContributionDraftProvider();
  }

  if (providerId === "openai-compatible") {
    const options: Parameters<typeof createOpenAiCompatibleContributionDraftProvider>[0] = {
      model: requireProviderEnvInput(
        readEnvInput(env.INPUT_PROVIDER_MODEL) ?? config.providerModel,
        "INPUT_PROVIDER_MODEL or config providerModel",
      ),
      token: requireProviderEnvInput(env.CLARISSIMI_PROVIDER_TOKEN, "CLARISSIMI_PROVIDER_TOKEN"),
    };
    assignOptional(
      options,
      "endpoint",
      readEnvInput(env.INPUT_PROVIDER_ENDPOINT) ?? config.providerEndpoint,
    );
    assignOptional(
      options,
      "endpointTrust",
      parseProviderEndpointTrust(
        readEnvInput(env.INPUT_PROVIDER_ENDPOINT_TRUST) ?? config.providerEndpointTrust,
      ),
    );
    assignOptional(
      options,
      "thinking",
      parseProviderThinking(readEnvInput(env.INPUT_PROVIDER_THINKING) ?? config.providerThinking),
    );
    assignOptional(options, "fetch", runtime.fetch);
    return createOpenAiCompatibleContributionDraftProvider(options);
  }

  throw new ActionUsageError(`Unsupported provider: ${providerId}.`);
}

function requireProviderEnvInput(value: string | undefined, name: string): string {
  const normalized = readEnvInput(value);
  if (normalized === undefined) {
    throw new ActionUsageError(`${name} is required for the openai-compatible provider.`);
  }

  return normalized;
}

function parseProviderThinking(value: string | undefined): ConfigProviderThinking | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isConfigProviderThinking(value)) {
    throw new ActionUsageError("INPUT_PROVIDER_THINKING supports only disabled.");
  }

  return value;
}

function parseProviderEndpointTrust(
  value: string | undefined,
): ConfigProviderEndpointTrust | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isConfigProviderEndpointTrust(value)) {
    throw new ActionUsageError(
      "INPUT_PROVIDER_ENDPOINT_TRUST supports only public or private-network.",
    );
  }

  return value;
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
