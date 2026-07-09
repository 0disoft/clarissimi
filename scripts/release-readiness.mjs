import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const requiredPackageScripts = [
  {
    name: "docs",
    includes: ["scripts/validate-docs.mjs"]
  },
  {
    name: "smoke",
    includes: ["scripts/smoke.mjs"]
  },
  {
    name: "check",
    includes: ["pnpm run typecheck", "pnpm run test"]
  },
  {
    name: "contract",
    includes: ["pnpm run typecheck", "pnpm run test"]
  },
  {
    name: "release-readiness",
    includes: ["scripts/release-readiness.mjs"]
  },
  {
    name: "live-provider-smoke",
    includes: ["scripts/live-provider-smoke.mjs"]
  },
  {
    name: "hosted-live-provider-smoke",
    includes: ["scripts/hosted-live-provider-smoke.mjs"]
  }
];

export const requiredTestGlobs = [
  "packages/schemas/test/*.test.mjs",
  "packages/redaction/test/*.test.mjs",
  "packages/core/test/*.test.mjs",
  "packages/github/test/*.test.mjs",
  "packages/providers/test/*.test.mjs",
  "packages/renderers/test/*.test.mjs",
  "packages/cli/test/*.test.mjs",
  "packages/action/test/*.test.mjs",
  "scripts/test/*.test.mjs"
];

export const packageReleasePolicy = {
  private: true,
  version: "0.0.0"
};

export const highRiskSecretEnvNames = [
  "NPM_TOKEN",
  "NODE_AUTH_TOKEN",
  "CLARISSIMI_PROVIDER_TOKEN",
  "OPENAI_API_" + "KEY",
  "ANTHROPIC_API_" + "KEY",
  "GEMINI_API_" + "KEY",
  "DEEPSEEK_API_" + "KEY",
  "OPENCODE_GO_API_" + "KEY",
  "UMANS_API_" + "KEY",
  "GITHUB_TOKEN",
  "GITHUB_PAT",
  "GITHUB_PAT_ODISOFT"
];

export const hostedLiveProviderWorkflowContract = {
  path: ".github/workflows/clarissimi-live-provider-smoke.yml",
  requiredInputs: [
    { name: "provider-model", required: true },
    { name: "provider-endpoint", required: false },
    { name: "provider-thinking", required: false }
  ],
  secretName: "CLARISSIMI_PROVIDER_TOKEN",
  runCommand: "pnpm run live-provider-smoke"
};

export const ciWorkflowContract = {
  path: ".github/workflows/ci.yml",
  requiredTriggers: [
    "push:",
    "pull_request:",
    "workflow_dispatch:"
  ],
  requiredPermissions: [
    "contents: read"
  ],
  requiredCommands: [
    "pnpm install --frozen-lockfile",
    "pnpm run docs",
    "pnpm run release-readiness",
    "pnpm run smoke",
    "pnpm run check",
    "pnpm run contract"
  ]
};

export const actionManifestContract = {
  path: "action.yml",
  requiredInputs: [
    { name: "mode", default: "propose" },
    { name: "event-path" },
    { name: "github-fixture" },
    { name: "base-branch", default: "main" },
    { name: "remote-name", default: "origin" },
    { name: "staging-dir" },
    { name: "provider", default: "fake" },
    { name: "provider-model" },
    { name: "provider-endpoint" },
    { name: "provider-thinking" }
  ],
  forbiddenInputs: [
    "github-token",
    "provider-token",
    "clarissimi-provider-token"
  ],
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
    "proposal-pull-request-action"
  ],
  requiredEnvMappings: [
    "GITHUB_TOKEN: ${{ (inputs.mode == 'propose' || inputs.mode == 'stage-draft') && github.token || '' }}",
    "INPUT_MODE: ${{ inputs.mode }}",
    "INPUT_EVENT_PATH: ${{ inputs.event-path }}",
    "INPUT_GITHUB_FIXTURE: ${{ inputs.github-fixture }}",
    "INPUT_BASE_BRANCH: ${{ inputs.base-branch }}",
    "INPUT_REMOTE_NAME: ${{ inputs.remote-name }}",
    "INPUT_STAGING_DIR: ${{ inputs.staging-dir }}",
    "INPUT_PROVIDER: ${{ inputs.provider }}",
    "INPUT_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "INPUT_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "INPUT_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}"
  ],
  requiredCommands: [
    "pnpm --dir \"$GITHUB_ACTION_PATH\" install --frozen-lockfile",
    "pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build",
    "node \"$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js\""
  ]
};

export const dogfoodWorkflowContracts = [
  {
    path: ".github/workflows/clarissimi-dry-run.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: read",
      "mode: dry-run",
      "github-fixture: fixtures/github-merged-pr-basic.json",
      "event-path: fixtures/github-pull-request-merged-event.json",
      "test \"${{ steps.fixture.outputs.mode }}\" = \"dry-run\"",
      "test \"${{ steps.event.outputs.mode }}\" = \"dry-run\"",
      "test \"${{ steps.fixture.outputs.input-source }}\" = \"github_fixture\"",
      "test \"${{ steps.event.outputs.input-source }}\" = \"github_event_path\""
    ],
    forbiddenSnippets: [
      "contents: write",
      "pull-requests: write"
    ]
  },
  {
    path: ".github/workflows/clarissimi-propose-fixture.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: write",
      "pull-requests: write",
      "issues: read",
      "fetch-depth: 0",
      "mode: propose",
      "github-fixture: fixtures/github-merged-pr-approved.json",
      "base-branch: ${{ inputs.base-branch }}",
      "test \"${{ steps.propose.outputs.proposed-entry-count }}\" = \"1\"",
      "test \"${{ steps.propose.outputs.mode }}\" = \"propose\"",
      "test \"${{ steps.propose.outputs.approval-status }}\" = \"approved\"",
      "test \"${{ steps.propose.outputs.staged-file-count }}\" = \"4\"",
      "test -n \"${{ steps.propose.outputs.proposal-pull-request-url }}\""
    ]
  },
  {
    path: ".github/workflows/clarissimi-stage-draft-fixture.yml",
    requiredSnippets: [
      "workflow_dispatch:",
      "contents: write",
      "pull-requests: write",
      "issues: read",
      "fetch-depth: 0",
      "mode: stage-draft",
      "github-fixture: fixtures/github-merged-pr-basic.json",
      "base-branch: ${{ inputs.base-branch }}",
      "test \"${{ steps.stage.outputs.proposed-entry-count }}\" = \"0\"",
      "test \"${{ steps.stage.outputs.mode }}\" = \"stage-draft\"",
      "test \"${{ steps.stage.outputs.approval-status }}\" = \"draft\"",
      "test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"",
      "test -n \"${{ steps.stage.outputs.proposal-pull-request-url }}\""
    ]
  }
];

export async function runReleaseReadiness(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const workflowDir = join(repoRoot, ".github", "workflows");
  const workflowFiles = await listFiles(workflowDir, (name) => name.endsWith(".yml") || name.endsWith(".yaml"), repoRoot);
  const yamlFiles = ["action.yml", ...workflowFiles.map((file) => toRepoPath(repoRoot, file))];

  await runCheck({
    repoRoot,
    name: "docs validation",
    command: process.execPath,
    args: ["scripts/validate-docs.mjs"]
  });

  await runPackageScriptRegistrationCheck(repoRoot);
  await runPackageReleasePolicyCheck(repoRoot);
  await runToolAvailabilityCheck(repoRoot);

  await runCheck({
    repoRoot,
    name: "ssealed doctor",
    command: "ssealed",
    args: ["doctor", ".", "--json"],
    validate({ stdout }) {
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (error) {
        throw new Error(`ssealed doctor did not emit parseable JSON: ${error.message}`);
      }

      if (result.ok !== true) {
        throw new Error("ssealed doctor reported ok=false.");
      }
    }
  });

  await runCheck({
    repoRoot,
    name: "workflow actionlint",
    command: "actionlint",
    args: workflowFiles.map((file) => toRepoPath(repoRoot, file))
  });

  for (const file of yamlFiles) {
    await runCheck({
      repoRoot,
      name: `yaml parse: ${file}`,
      command: "yq",
      args: ["eval", ".", file],
      redactOutput: true
    });
  }

  await runActionManifestContractCheck(repoRoot);
  await runCiWorkflowContractCheck(repoRoot);
  await runDogfoodWorkflowContractChecks(repoRoot);
  await runHostedLiveProviderWorkflowContractCheck(repoRoot);

  await runCheck({
    repoRoot,
    name: "git diff whitespace check",
    command: "git",
    args: ["diff", "--check"]
  });

  await runSecretScan(repoRoot);

  console.log("release readiness static gates passed");
  console.log("credentialed gates still required: pnpm run live-provider-smoke and hosted clarissimi-live-provider-smoke.yml");
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runReleaseReadiness();
}

async function runCheck(options) {
  const result = await runCommand(options.command, options.args, options.repoRoot);
  if (result.exitCode !== 0) {
    const stdout = options.redactOutput ? "[redacted]" : result.stdout.trim();
    const stderr = options.redactOutput ? "[redacted]" : result.stderr.trim();
    throw new Error(
      `${options.name} failed with exit code ${result.exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
    );
  }

  if (options.validate !== undefined) {
    options.validate(result);
  }

  console.log(`${options.name} passed`);
}

function runCommand(command, args, repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function runSecretScan(repoRoot) {
  const files = await listFiles(repoRoot, () => true, repoRoot);
  const hits = [];

  for (const file of files) {
    const repoPath = toRepoPath(repoRoot, file);
    if (shouldSkipSecretScanPath(repoPath)) {
      continue;
    }

    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }

    hits.push(...findHighRiskSecretLines(repoPath, text));
  }

  if (hits.length > 0) {
    throw new Error(`secret scan found high-risk patterns:\n${hits.join("\n")}`);
  }

  console.log("secret scan passed");
}

export function findHighRiskSecretLines(repoPath, text) {
  const highRiskEnvAssignments = highRiskSecretEnvNames.map((name) => `${escapeRegExp(name)}\\s*=`);
  const pattern = new RegExp([
    "sk-(proj|live|test|ant|svc|admin|user|org|key)-[A-Za-z0-9_-]{8,}",
    "ghp_[A-Za-z0-9]{20,}",
    "BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY",
    ...highRiskEnvAssignments
  ].join("|"));
  const lines = text.split(/\r?\n/);
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      hits.push(`${repoPath}:${index + 1}`);
    }
  }

  return hits;
}

export function validateHostedLiveProviderWorkflowContract(text, contract = hostedLiveProviderWorkflowContract) {
  const issues = [];

  for (const input of contract.requiredInputs) {
    const block = findYamlMappingBlock(text, input.name);
    if (block === undefined) {
      issues.push(`${contract.path} must define workflow_dispatch input ${input.name}.`);
      continue;
    }

    const requiredValue = findYamlScalarValue(block, "required");
    const expected = String(input.required);
    if (requiredValue !== expected) {
      issues.push(`${contract.path} input ${input.name} must set required: ${expected}.`);
    }
  }

  if (!text.includes(`secrets.${contract.secretName}`)) {
    issues.push(`${contract.path} must read secrets.${contract.secretName}.`);
  }

  if (!text.includes(contract.runCommand)) {
    issues.push(`${contract.path} must run ${contract.runCommand}.`);
  }

  return issues;
}

export function validateCiWorkflowContract(text, contract = ciWorkflowContract) {
  const issues = [];

  for (const trigger of contract.requiredTriggers) {
    if (!text.includes(trigger)) {
      issues.push(`${contract.path} must define ${trigger} trigger.`);
    }
  }

  for (const permission of contract.requiredPermissions) {
    if (!text.includes(permission)) {
      issues.push(`${contract.path} must set ${permission}.`);
    }
  }

  for (const command of contract.requiredCommands) {
    if (!text.includes(command)) {
      issues.push(`${contract.path} must run ${command}.`);
    }
  }

  return issues;
}

export function validateActionManifestContract(text, contract = actionManifestContract) {
  const issues = [];
  const inputsBlock = findRequiredYamlMappingBlock(text, contract.path, "inputs", issues);
  const outputsBlock = findRequiredYamlMappingBlock(text, contract.path, "outputs", issues);

  for (const input of contract.requiredInputs) {
    const block = inputsBlock === undefined ? undefined : findYamlMappingBlock(inputsBlock, input.name);
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
    const block = outputsBlock === undefined ? undefined : findYamlMappingBlock(outputsBlock, output);
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

  return issues;
}

export function validateDogfoodWorkflowContract(text, contract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  for (const snippet of contract.forbiddenSnippets ?? []) {
    if (text.includes(snippet)) {
      issues.push(`${contract.path} must not include ${snippet}.`);
    }
  }

  return issues;
}

async function runDogfoodWorkflowContractChecks(repoRoot) {
  const issues = [];

  for (const contract of dogfoodWorkflowContracts) {
    const workflowPath = join(repoRoot, contract.path);
    let text;
    try {
      text = await readFile(workflowPath, "utf8");
    } catch (error) {
      throw new Error(`Unable to read ${contract.path}: ${error.message}`);
    }

    issues.push(...validateDogfoodWorkflowContract(text, contract));
  }

  if (issues.length > 0) {
    throw new Error(`dogfood workflow contract failed:\n${issues.join("\n")}`);
  }

  console.log("dogfood workflow contract passed");
}

async function runActionManifestContractCheck(repoRoot) {
  const actionPath = join(repoRoot, actionManifestContract.path);
  let text;
  try {
    text = await readFile(actionPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${actionManifestContract.path}: ${error.message}`);
  }

  const issues = validateActionManifestContract(text);
  if (issues.length > 0) {
    throw new Error(`Action manifest contract failed:\n${issues.join("\n")}`);
  }

  console.log("Action manifest contract passed");
}

async function runCiWorkflowContractCheck(repoRoot) {
  const workflowPath = join(repoRoot, ciWorkflowContract.path);
  let text;
  try {
    text = await readFile(workflowPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${ciWorkflowContract.path}: ${error.message}`);
  }

  const issues = validateCiWorkflowContract(text);
  if (issues.length > 0) {
    throw new Error(`CI workflow contract failed:\n${issues.join("\n")}`);
  }

  console.log("CI workflow contract passed");
}

async function runHostedLiveProviderWorkflowContractCheck(repoRoot) {
  const workflowPath = join(repoRoot, hostedLiveProviderWorkflowContract.path);
  let text;
  try {
    text = await readFile(workflowPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${hostedLiveProviderWorkflowContract.path}: ${error.message}`);
  }

  const issues = validateHostedLiveProviderWorkflowContract(text);
  if (issues.length > 0) {
    throw new Error(`hosted live provider workflow contract failed:\n${issues.join("\n")}`);
  }

  console.log("hosted live provider workflow contract passed");
}

async function runToolAvailabilityCheck(repoRoot) {
  const tools = [
    {
      name: "ssealed",
      command: "ssealed",
      args: ["--version"],
      installHint: "Install ssealed before running release readiness."
    },
    {
      name: "actionlint",
      command: "actionlint",
      args: ["-version"],
      installHint: "Install actionlint before running release readiness."
    },
    {
      name: "yq",
      command: "yq",
      args: ["--version"],
      installHint: "Install mikefarah/yq before running release readiness."
    }
  ];

  for (const tool of tools) {
    let result;
    try {
      result = await runCommand(tool.command, tool.args, repoRoot);
    } catch (error) {
      throw new Error(`${tool.name} is required but could not be started. ${tool.installHint} ${error.message}`);
    }

    if (result.exitCode !== 0) {
      throw new Error(
        `${tool.name} availability check failed with exit code ${result.exitCode}. ${tool.installHint}\n` +
        `STDERR:\n${result.stderr.trim()}`
      );
    }
  }

  console.log("release readiness tool availability passed");
}

async function runPackageScriptRegistrationCheck(repoRoot) {
  const packageJsonPath = join(repoRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json is not parseable JSON: ${error.message}`);
  }

  const issues = validatePackageScriptRegistration(packageJson);
  if (issues.length > 0) {
    throw new Error(`package.json script registration failed:\n${issues.join("\n")}`);
  }

  console.log("package script registration passed");
}

async function runPackageReleasePolicyCheck(repoRoot) {
  const packageJsonPath = join(repoRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json is not parseable JSON: ${error.message}`);
  }

  const issues = validatePackageReleasePolicy(packageJson);
  if (issues.length > 0) {
    throw new Error(`package.json release policy failed:\n${issues.join("\n")}`);
  }

  console.log("package release policy passed");
}

export function validatePackageScriptRegistration(packageJson) {
  const issues = [];
  const scripts = packageJson?.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    return ["package.json scripts must be configured."];
  }

  for (const script of requiredPackageScripts) {
    const value = scripts[script.name];
    if (typeof value !== "string") {
      issues.push(`package.json scripts.${script.name} must be configured.`);
      continue;
    }

    for (const expected of script.includes) {
      if (!value.includes(expected)) {
        issues.push(`package.json scripts.${script.name} must include ${expected}.`);
      }
    }
  }

  const testScript = scripts.test;
  if (typeof testScript !== "string") {
    issues.push("package.json scripts.test must be configured.");
    return issues;
  }

  for (const glob of requiredTestGlobs) {
    if (!testScript.includes(glob)) {
      issues.push(`package.json scripts.test must include ${glob}.`);
    }
  }

  return issues;
}

export function validatePackageReleasePolicy(packageJson, policy = packageReleasePolicy) {
  const issues = [];

  if (packageJson?.private !== policy.private) {
    issues.push(`package.json private must remain ${String(policy.private)} until release blockers are cleared.`);
  }

  if (packageJson?.version !== policy.version) {
    issues.push(`package.json version must remain ${policy.version} until release blockers are cleared.`);
  }

  return issues;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRequiredYamlMappingBlock(text, path, key, issues) {
  const block = findYamlMappingBlock(text, key);
  if (block === undefined) {
    issues.push(`${path} must define ${key}.`);
  }

  return block;
}

function findYamlMappingBlock(text, key) {
  const lines = Array.isArray(text) ? text : text.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*$`);

  for (let index = 0; index < lines.length; index += 1) {
    const match = keyPattern.exec(lines[index]);
    if (match === null) {
      continue;
    }

    const indent = match[1].length;
    const block = [lines[index]];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim().length > 0 && leadingSpaceCount(line) <= indent) {
        break;
      }

      block.push(line);
    }

    return block;
  }

  return undefined;
}

function findYamlScalarValue(block, key) {
  const pattern = new RegExp(`^\\s+${escapeRegExp(key)}:\\s*(.*?)\\s*$`);
  for (const line of block) {
    const match = pattern.exec(line);
    if (match !== null) {
      return match[1];
    }
  }

  return undefined;
}

function leadingSpaceCount(value) {
  const match = /^ */.exec(value);
  return match === null ? 0 : match[0].length;
}

function shouldSkipSecretScanPath(repoPath) {
  return repoPath === ".git"
    || repoPath.startsWith(".git/")
    || repoPath === "node_modules"
    || repoPath.includes("/node_modules/")
    || repoPath.includes("/dist/")
    || repoPath.endsWith(".tsbuildinfo");
}

async function listFiles(dir, predicate, repoRoot) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipTraversalPath(repoRoot, entryPath)) {
        continue;
      }

      files.push(...await listFiles(entryPath, predicate, repoRoot));
      continue;
    }

    if (entry.isFile() && predicate(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function shouldSkipTraversalPath(repoRoot, path) {
  return shouldSkipSecretScanPath(toRepoPath(repoRoot, path));
}

function toRepoPath(repoRoot, path) {
  return relative(repoRoot, path).replaceAll(sep, "/");
}
