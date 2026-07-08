import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await runJsonCommand({
  name: "CLI validate-config",
  command: process.execPath,
  args: ["packages/cli/dist/bin/clarissimi.js", "validate-config", "--json"],
  expectExitCode: 0,
  validate(output) {
    assertEqual(output.ok, true, "validate-config should succeed.");
    assertEqual(output.command, "validate-config", "validate-config command name should match.");
  }
});

await runJsonCommand({
  name: "CLI GitHub fixture recognize",
  command: process.execPath,
  args: [
    "packages/cli/dist/bin/clarissimi.js",
    "recognize",
    "--github-fixture",
    "fixtures/github-merged-pr-basic.json",
    "--mode",
    "dry-run",
    "--json"
  ],
  expectExitCode: 0,
  validate(output) {
    assertEqual(output.ok, true, "recognize should succeed.");
    assertEqual(output.command, "recognize", "recognize command name should match.");
    assertEqual(output.fixtureKind, "github", "recognize should use the GitHub fixture path.");
    assertEqual(output.approvalStatus, "draft", "basic GitHub fixture should remain a draft.");
    assertEqual(output.publicOutputsRendered, false, "draft fixture must not render public outputs.");
  }
});

await runJsonCommand({
  name: "Action explicit dry-run",
  command: process.execPath,
  args: ["packages/action/dist/bin/clarissimi-action.js"],
  env: {
    INPUT_MODE: "dry-run",
    INPUT_GITHUB_FIXTURE: "fixtures/github-merged-pr-basic.json"
  },
  expectExitCode: 0,
  validate(output) {
    assertEqual(output.ok, true, "Action dry-run should succeed.");
    assertEqual(output.mode, "dry-run", "Action explicit dry-run should preserve dry-run mode.");
    assertEqual(output.inputSource, "github_fixture", "Action dry-run should use the fixture source.");
    assertEqual(output.proposedEntryCount, 0, "dry-run must not propose public entries.");
  }
});

await runCommand({
  name: "Action default propose requires token",
  command: process.execPath,
  args: ["packages/action/dist/bin/clarissimi-action.js"],
  env: {
    INPUT_GITHUB_FIXTURE: "fixtures/github-merged-pr-approved.json"
  },
  expectExitCode: 1,
  validate({ stdout, stderr }) {
    assertEqual(stdout, "", "default propose token failure should not write stdout.");
    if (!stderr.includes("GITHUB_TOKEN is required for propose mode.")) {
      throw new Error("default propose token failure should explain the missing GitHub token.");
    }
  }
});

console.log("smoke validation passed");

async function runJsonCommand(options) {
  const result = await runCommand({
    name: options.name,
    command: options.command,
    args: options.args,
    env: options.env,
    expectExitCode: options.expectExitCode
  });
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${options.name} did not emit parseable JSON: ${error.message}`);
  }

  options.validate(output);
}

function runCommand(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...(options.env ?? {})
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
      if (exitCode !== options.expectExitCode) {
        reject(
          new Error(
            `${options.name} exited with ${exitCode}, expected ${options.expectExitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          )
        );
        return;
      }

      try {
        options.validate?.({ stdout, stderr });
      } catch (error) {
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
