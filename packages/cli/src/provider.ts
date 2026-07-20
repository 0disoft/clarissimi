import {
  createFakeContributionDraftProvider,
  createOpenAiCompatibleContributionDraftProvider,
  type ContributionDraftProvider,
} from "@clarissimi/providers";
import {
  isConfigProvider,
  isConfigProviderEndpointTrust,
  isConfigProviderThinking,
  type ConfigProviderEndpointTrust,
  type ConfigProviderThinking,
} from "@clarissimi/schemas";

import { CliUsageError, getStringFlag, type ParsedArgs } from "./args.js";
import { validateConfigFile, type CliConfig } from "./config.js";
import type { CliIo } from "./io.js";

export async function resolveRecognitionProvider(
  args: ParsedArgs,
  io: CliIo,
  existingConfig?: CliConfig,
): Promise<ContributionDraftProvider> {
  const configPath = getStringFlag(args, "config");
  const config = existingConfig ?? (await validateConfigFile(io.cwd, configPath)).config;
  const providerId = getStringFlag(args, "provider") ?? config.provider ?? "fake";
  if (!isConfigProvider(providerId)) {
    throw new CliUsageError(`Unsupported provider: ${providerId}`);
  }

  if (providerId === "fake") {
    return createFakeContributionDraftProvider();
  }

  if (providerId === "openai-compatible") {
    const options: Parameters<typeof createOpenAiCompatibleContributionDraftProvider>[0] = {
      model: requiredProviderOption(
        getStringFlag(args, "provider-model") ?? config.providerModel,
        "provider model",
        "--provider-model or config providerModel",
      ),
      token: requiredProviderToken(io.env ?? process.env),
    };
    assignOptional(options, "fetch", io.fetch);
    assignOptional(
      options,
      "endpoint",
      getStringFlag(args, "provider-endpoint") ?? config.providerEndpoint,
    );
    assignOptional(
      options,
      "endpointTrust",
      parseProviderEndpointTrust(
        getStringFlag(args, "provider-endpoint-trust") ?? config.providerEndpointTrust,
      ),
    );
    assignOptional(
      options,
      "thinking",
      parseProviderThinking(getStringFlag(args, "provider-thinking") ?? config.providerThinking),
    );
    return createOpenAiCompatibleContributionDraftProvider(options);
  }

  throw new CliUsageError(`Unsupported provider: ${providerId}`);
}

function requiredProviderOption(value: string | undefined, label: string, source: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new CliUsageError(`OpenAI-compatible provider requires ${label} from ${source}.`);
  }

  return value;
}

function requiredProviderToken(env: NodeJS.ProcessEnv): string {
  const token = env.CLARISSIMI_PROVIDER_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    throw new CliUsageError("OpenAI-compatible provider requires CLARISSIMI_PROVIDER_TOKEN.");
  }

  return token;
}

function parseProviderThinking(value: string | undefined): ConfigProviderThinking | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  if (!isConfigProviderThinking(value)) {
    throw new CliUsageError("OpenAI-compatible provider thinking supports only disabled.");
  }

  return value;
}

function parseProviderEndpointTrust(
  value: string | undefined,
): ConfigProviderEndpointTrust | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  if (!isConfigProviderEndpointTrust(value)) {
    throw new CliUsageError(
      "OpenAI-compatible provider endpoint trust supports only public or private-network.",
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
