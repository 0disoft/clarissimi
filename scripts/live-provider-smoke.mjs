import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const providerToken = readEnv("CLARISSIMI_PROVIDER_TOKEN");
const providerModel = readEnv("CLARISSIMI_PROVIDER_MODEL");
const providerEndpoint = readEnv("CLARISSIMI_PROVIDER_ENDPOINT");
const providerThinking = readEnv("CLARISSIMI_PROVIDER_THINKING");
const smokeEmail = "clarissimi-live-smoke@example.com";

if (providerToken === undefined || providerModel === undefined) {
  const missing = [
    providerToken === undefined ? "CLARISSIMI_PROVIDER_TOKEN" : undefined,
    providerModel === undefined ? "CLARISSIMI_PROVIDER_MODEL" : undefined
  ].filter(Boolean);
  console.error(`live provider smoke requires ${missing.join(" and ")}.`);
  console.error("No provider call was made.");
  process.exit(2);
}

if (providerEndpoint !== undefined && !isHttpsUrl(providerEndpoint)) {
  console.error("live provider smoke requires CLARISSIMI_PROVIDER_ENDPOINT to be an https URL when provided.");
  console.error("No provider call was made.");
  process.exit(2);
}

if (providerThinking !== undefined && providerThinking !== "disabled") {
  console.error("live provider smoke supports only CLARISSIMI_PROVIDER_THINKING=disabled.");
  console.error("No provider call was made.");
  process.exit(2);
}

const fixturePath = await createSmokeFixture();
const args = [
  "packages/cli/dist/bin/clarissimi.js",
  "recognize",
  "--github-fixture",
  fixturePath,
  "--mode",
  "dry-run",
  "--provider",
  "openai-compatible",
  "--provider-model",
  providerModel,
  "--json"
];

if (providerEndpoint !== undefined) {
  args.push("--provider-endpoint", providerEndpoint);
}

if (providerThinking !== undefined) {
  args.push("--provider-thinking", providerThinking);
}

const result = await runCommand({
  command: process.execPath,
  args,
  env: {
    CLARISSIMI_PROVIDER_TOKEN: providerToken
  }
});

if (result.exitCode !== 0) {
  console.error(`live provider smoke failed with exit code ${result.exitCode}.`);
  writeBoundedProcessOutput(result);
  process.exit(result.exitCode ?? 1);
}

let output;
try {
  output = JSON.parse(result.stdout);
} catch (error) {
  console.error(`live provider smoke did not emit parseable JSON: ${error.message}`);
  writeBoundedProcessOutput(result);
  process.exit(1);
}

assertEqual(output.ok, true, "recognize should succeed.");
assertEqual(output.command, "recognize", "recognize command name should match.");
assertEqual(output.provider, "openai-compatible", "recognize should use the selected provider.");
assertEqual(output.fixtureKind, "github", "recognize should use the GitHub fixture path.");
assertEqual(output.approvalStatus, "draft", "live provider drafts must remain draft.");
assertEqual(output.publicOutputsRendered, false, "live provider drafts must not render public output.");

const outputText = JSON.stringify(output);
if (outputText.includes(providerToken)) {
  throw new Error("live provider smoke output leaked CLARISSIMI_PROVIDER_TOKEN.");
}

if (outputText.includes(smokeEmail)) {
  throw new Error("live provider smoke output leaked an unredacted email sentinel.");
}

console.log("live provider smoke passed");

async function createSmokeFixture() {
  const baseFixturePath = join(repoRoot, "fixtures/github-merged-pr-basic.json");
  const fixture = JSON.parse(await readFile(baseFixturePath, "utf8"));
  fixture.pullRequest.body = `${fixture.pullRequest.body} Maintainer contact: ${smokeEmail}.`;
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-live-provider-smoke-"));
  const path = join(dir, "github-merged-pr-live-smoke.json");
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return path;
}

function readEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function runCommand(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...options.env
      },
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
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function writeBoundedProcessOutput(result) {
  const stdout = redactSensitiveText(result.stdout).slice(0, 4000);
  const stderr = redactSensitiveText(result.stderr).slice(0, 4000);
  if (stdout.length > 0) {
    console.error(`STDOUT:\n${stdout}`);
  }

  if (stderr.length > 0) {
    console.error(`STDERR:\n${stderr}`);
  }
}

function redactSensitiveText(value) {
  return value
    .replaceAll(providerToken, "[REDACTED_PROVIDER_TOKEN]")
    .replaceAll(smokeEmail, "[REDACTED_EMAIL_SENTINEL]");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
