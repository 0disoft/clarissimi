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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findYamlMappingBlock(text, key) {
  const lines = text.split(/\r?\n/);
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
  const pattern = new RegExp(`^\\s+${escapeRegExp(key)}:\\s*(\\S+)\\s*$`);
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
