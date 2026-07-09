import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDir = join(repoRoot, ".github", "workflows");
const workflowFiles = await listFiles(workflowDir, (name) => name.endsWith(".yml") || name.endsWith(".yaml"));
const yamlFiles = ["action.yml", ...workflowFiles.map(toRepoPath)];

await runCheck({
  name: "docs validation",
  command: process.execPath,
  args: ["scripts/validate-docs.mjs"]
});

await runTestRegistrationCheck();
await runToolAvailabilityCheck();

await runCheck({
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
  name: "workflow actionlint",
  command: "actionlint",
  args: workflowFiles.map(toRepoPath)
});

for (const file of yamlFiles) {
  await runCheck({
    name: `yaml parse: ${file}`,
    command: "yq",
    args: ["eval", ".", file],
    redactOutput: true
  });
}

await runCheck({
  name: "git diff whitespace check",
  command: "git",
  args: ["diff", "--check"]
});

await runSecretScan();

console.log("release readiness static gates passed");
console.log("credentialed gates still required: pnpm run live-provider-smoke and hosted clarissimi-live-provider-smoke.yml");

async function runCheck(options) {
  const result = await runCommand(options.command, options.args);
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

function runCommand(command, args) {
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

async function runSecretScan() {
  const highRiskEnvAssignments = [
    "NPM_TOKEN",
    "OPENAI_API_" + "KEY",
    "ANTHROPIC_API_" + "KEY",
    "GEMINI_API_" + "KEY"
  ].map((name) => `${escapeRegExp(name)}=`);
  const pattern = new RegExp([
    "sk-(proj|live|test|ant|svc|admin|user|org|key)-[A-Za-z0-9_-]{8,}",
    "ghp_[A-Za-z0-9]{20,}",
    "BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY",
    ...highRiskEnvAssignments
  ].join("|"));
  const files = await listFiles(repoRoot, () => true);
  const hits = [];

  for (const file of files) {
    const repoPath = toRepoPath(file);
    if (shouldSkipSecretScanPath(repoPath)) {
      continue;
    }

    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (pattern.test(lines[index])) {
        hits.push(`${repoPath}:${index + 1}`);
      }
    }
  }

  if (hits.length > 0) {
    throw new Error(`secret scan found high-risk patterns:\n${hits.join("\n")}`);
  }

  console.log("secret scan passed");
}

async function runToolAvailabilityCheck() {
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
      result = await runCommand(tool.command, tool.args);
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

async function runTestRegistrationCheck() {
  const packageJsonPath = join(repoRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`package.json is not parseable JSON: ${error.message}`);
  }

  const testScript = packageJson?.scripts?.test;
  if (typeof testScript !== "string") {
    throw new Error("package.json scripts.test must be configured.");
  }

  const requiredTestGlobs = [
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
  const missing = requiredTestGlobs.filter((glob) => !testScript.includes(glob));
  if (missing.length > 0) {
    throw new Error(`package.json scripts.test is missing test globs:\n${missing.join("\n")}`);
  }

  console.log("test registration passed");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldSkipSecretScanPath(repoPath) {
  return repoPath === ".git"
    || repoPath.startsWith(".git/")
    || repoPath === "node_modules"
    || repoPath.includes("/node_modules/")
    || repoPath.includes("/dist/")
    || repoPath.endsWith(".tsbuildinfo");
}

async function listFiles(dir, predicate) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipTraversalPath(entryPath)) {
        continue;
      }

      files.push(...await listFiles(entryPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function shouldSkipTraversalPath(path) {
  return shouldSkipSecretScanPath(toRepoPath(path));
}

function toRepoPath(path) {
  return relative(repoRoot, path).replaceAll(sep, "/");
}
