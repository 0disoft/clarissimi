import {
  findRequiredYamlMappingBlock,
  findYamlMappingBlock,
  findYamlScalarValue,
} from "./yaml-contract.mjs";

export const actionManifestContract = {
  path: "action.yml",
  branding: { icon: "award", color: "purple" },
  requiredInputs: [
    { name: "mode", default: "propose" },
    { name: "gate-mode", default: "advisory" },
    { name: "event-path" },
    { name: "github-fixture" },
    { name: "config-path" },
    { name: "markdown-summary" },
    { name: "include-automation-contributors" },
    { name: "comment-mode", default: "none" },
    { name: "draft-path" },
    { name: "base-branch", default: "main" },
    { name: "remote-name", default: "origin" },
    { name: "staging-dir" },
    { name: "summary-path" },
    { name: "provider" },
    { name: "provider-model" },
    { name: "provider-endpoint" },
    { name: "provider-endpoint-trust" },
    { name: "provider-thinking" },
  ],
  forbiddenInputs: ["github-token", "provider-token", "clarissimi-provider-token"],
  requiredOutputs: [
    "draft-count",
    "proposed-entry-count",
    "skipped-entry-count",
    "mode",
    "input-source",
    "approval-status",
    "redaction-match-count",
    "staged-file-count",
    "proposal-branch",
    "proposal-commit-sha",
    "proposal-pull-request-number",
    "proposal-pull-request-url",
    "proposal-pull-request-action",
    "source-comment-action",
    "source-comment-url",
    "summary-json-path",
    "direct-commit-branch",
    "direct-commit-base-sha",
    "direct-commit-sha",
    "direct-commit-created",
    "direct-commit-pushed",
    "gate-mode",
    "gate-passed",
    "gate-decision",
    "gate-reason",
  ],
  requiredEnvMappings: [
    "GITHUB_TOKEN: ${{ (inputs.mode == 'gate' || inputs.mode == 'propose' || inputs.mode == 'commit' || inputs.mode == 'stage-draft' || inputs.mode == 'promote-draft') && github.token || '' }}",
    "INPUT_MODE: ${{ inputs.mode }}",
    "INPUT_GATE_MODE: ${{ inputs.gate-mode }}",
    "INPUT_EVENT_PATH: ${{ inputs.event-path }}",
    "INPUT_GITHUB_FIXTURE: ${{ inputs.github-fixture }}",
    "INPUT_CONFIG_PATH: ${{ inputs.config-path }}",
    "INPUT_MARKDOWN_SUMMARY: ${{ inputs.markdown-summary }}",
    "INPUT_INCLUDE_AUTOMATION_CONTRIBUTORS: ${{ inputs.include-automation-contributors }}",
    "INPUT_COMMENT_MODE: ${{ inputs.comment-mode }}",
    "INPUT_DRAFT_PATH: ${{ inputs.draft-path }}",
    "INPUT_BASE_BRANCH: ${{ inputs.base-branch }}",
    "INPUT_REMOTE_NAME: ${{ inputs.remote-name }}",
    "INPUT_STAGING_DIR: ${{ inputs.staging-dir }}",
    "INPUT_SUMMARY_PATH: ${{ inputs.summary-path }}",
    "INPUT_PROVIDER: ${{ inputs.provider }}",
    "INPUT_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "INPUT_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "INPUT_PROVIDER_ENDPOINT_TRUST: ${{ inputs.provider-endpoint-trust }}",
    "INPUT_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}",
  ],
  requiredCommands: ['node "$GITHUB_ACTION_PATH/action-dist/index.js"'],
  forbiddenCommands: [
    "corepack enable",
    'pnpm --dir "$GITHUB_ACTION_PATH" install',
    'pnpm --dir "$GITHUB_ACTION_PATH" --filter @clarissimi/action build',
    'node "$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js"',
  ],
};

export function validateActionManifestContract(text, contract = actionManifestContract) {
  const issues = [];
  const brandingBlock = findRequiredYamlMappingBlock(text, contract.path, "branding", issues);
  const inputsBlock = findRequiredYamlMappingBlock(text, contract.path, "inputs", issues);
  const outputsBlock = findRequiredYamlMappingBlock(text, contract.path, "outputs", issues);

  if (brandingBlock !== undefined) {
    for (const [key, expected] of Object.entries(contract.branding ?? {})) {
      const value = findYamlScalarValue(brandingBlock, key);
      if (value !== expected) {
        issues.push(`${contract.path} branding ${key} must be ${expected}.`);
      }
    }
  }

  for (const input of contract.requiredInputs) {
    const block =
      inputsBlock === undefined ? undefined : findYamlMappingBlock(inputsBlock, input.name);
    if (block === undefined) {
      issues.push(`${contract.path} must define input ${input.name}.`);
      continue;
    }

    if (input.default !== undefined) {
      const defaultValue = findYamlScalarValue(block, "default");
      if (defaultValue !== input.default) {
        issues.push(`${contract.path} input ${input.name} must set default: ${input.default}.`);
      }
    }
  }

  for (const inputName of contract.forbiddenInputs) {
    if (inputsBlock !== undefined && findYamlMappingBlock(inputsBlock, inputName) !== undefined) {
      issues.push(`${contract.path} must not expose ${inputName} as an action input.`);
    }
  }

  for (const output of contract.requiredOutputs) {
    const block =
      outputsBlock === undefined ? undefined : findYamlMappingBlock(outputsBlock, output);
    if (block === undefined) {
      issues.push(`${contract.path} must define output ${output}.`);
      continue;
    }

    const expectedValue = `\${{ steps.clarissimi.outputs.${output} }}`;
    const value = findYamlScalarValue(block, "value");
    if (value !== expectedValue) {
      issues.push(`${contract.path} output ${output} must map to ${expectedValue}.`);
    }
  }

  for (const mapping of contract.requiredEnvMappings) {
    if (!text.includes(mapping)) {
      issues.push(`${contract.path} must include env mapping ${mapping}.`);
    }
  }

  for (const command of contract.requiredCommands) {
    if (!text.includes(command)) {
      issues.push(`${contract.path} must run ${command}.`);
    }
  }

  for (const command of contract.forbiddenCommands ?? []) {
    if (text.includes(command)) {
      issues.push(`${contract.path} must not run ${command}.`);
    }
  }

  return issues;
}
