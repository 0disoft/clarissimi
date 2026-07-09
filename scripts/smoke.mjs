import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

await withTempDir("clarissimi-import-draft-smoke-", async (dir) => {
  const draftPath = join(dir, "agent-draft.json");
  const ledgerPath = join(dir, ".clarissimi", "contributions.jsonl");
  const outDir = join(dir, "out");
  await writeFile(
    draftPath,
    `${JSON.stringify({
      schemaVersion: "clarissimi.assessment/v1",
      contributor: {
        platform: "github",
        id: "123456",
        login: "octocat",
        profileUrl: "https://github.com/octocat"
      },
      contributionType: "test",
      affectedArea: "parser regression coverage",
      impactLevel: "medium",
      evidenceSummary: "Added regression coverage for parser behavior.",
      evidenceRefs: [
        {
          kind: "pull_request",
          id: "PR-42",
          url: "https://github.com/sample/project/pull/42",
          title: "Add parser regression coverage",
          excerpt: "Raw PR body should not be rendered."
        }
      ],
      suggestedBadge: "Regression Shield",
      publicRecognitionText: "Added regression coverage for the parser.",
      confidence: 0.82,
      maintainerApprovalStatus: "approved",
      source: {
        repository: "sample/project",
        event: "merged_pull_request",
        pullRequestNumber: 42,
        mergedAt: "2026-07-08T00:00:00.000Z"
      }
    }, null, 2)}\n`,
    "utf8"
  );

  await runJsonCommand({
    name: "CLI agent draft import",
    command: process.execPath,
    args: [
      "packages/cli/dist/bin/clarissimi.js",
      "import-draft",
      "--draft",
      draftPath,
      "--ledger",
      ledgerPath,
      "--out-dir",
      outDir,
      "--json"
    ],
    expectExitCode: 0,
    validate(output) {
      assertEqual(output.ok, true, "import-draft should succeed.");
      assertEqual(output.command, "import-draft", "import-draft command name should match.");
      assertEqual(output.records, 1, "import-draft should write one ledger record.");
      assertEqual(output.wroteDerivedFiles, true, "import-draft should write derived outputs when requested.");
    }
  });

  const ledgerText = await readFile(ledgerPath, "utf8");
  if (ledgerText.includes("Raw PR body should not be rendered.")) {
    throw new Error("import-draft smoke leaked raw evidence excerpt into the public ledger.");
  }
});

await withTempDir("clarissimi-stage-draft-smoke-", async (dir) => {
  const draftPath = join(dir, "agent-draft.json");
  const draftsDir = join(dir, ".clarissimi", "drafts");
  await writeFile(
    draftPath,
    `${JSON.stringify({
      schemaVersion: "clarissimi.assessment/v1",
      contributor: {
        platform: "github",
        id: "123456",
        login: "octocat",
        profileUrl: "https://github.com/octocat"
      },
      contributionType: "test",
      affectedArea: "parser regression coverage",
      impactLevel: "medium",
      evidenceSummary: "Added regression coverage for parser behavior.",
      evidenceRefs: [
        {
          kind: "pull_request",
          id: "PR-42",
          url: "https://github.com/sample/project/pull/42",
          title: "Add parser regression coverage",
          excerpt: "Raw PR body should not be staged."
        }
      ],
      suggestedBadge: "Regression Shield",
      publicRecognitionText: "Added regression coverage for the parser.",
      confidence: 0.82,
      maintainerApprovalStatus: "draft",
      source: {
        repository: "sample/project",
        event: "merged_pull_request",
        pullRequestNumber: 42,
        mergedAt: "2026-07-08T00:00:00.000Z"
      }
    }, null, 2)}\n`,
    "utf8"
  );

  await runJsonCommand({
    name: "CLI agent draft staging",
    command: process.execPath,
    args: [
      "packages/cli/dist/bin/clarissimi.js",
      "stage-draft",
      "--draft",
      draftPath,
      "--drafts-dir",
      draftsDir,
      "--json"
    ],
    expectExitCode: 0,
    validate(output) {
      assertEqual(output.ok, true, "stage-draft should succeed.");
      assertEqual(output.command, "stage-draft", "stage-draft command name should match.");
      assertEqual(output.approvalStatus, "draft", "stage-draft should keep draft approval status.");
    }
  });

  const draftText = await readFile(join(draftsDir, "sample-project-merged_pull_request-42.json"), "utf8");
  if (draftText.includes("Raw PR body should not be staged.")) {
    throw new Error("stage-draft smoke leaked raw evidence excerpt into the staged draft.");
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
    if (!stderr.includes("GITHUB_TOKEN is required for write modes.")) {
      throw new Error("default propose token failure should explain the missing GitHub token.");
    }
  }
});

await runCommand({
  name: "Live provider smoke requires credentials before provider calls",
  command: process.execPath,
  args: ["scripts/live-provider-smoke.mjs"],
  env: {
    CLARISSIMI_PROVIDER_TOKEN: "",
    CLARISSIMI_PROVIDER_MODEL: "",
    CLARISSIMI_PROVIDER_ENDPOINT: "",
    CLARISSIMI_PROVIDER_THINKING: ""
  },
  expectExitCode: 2,
  validate({ stdout, stderr }) {
    assertEqual(stdout, "", "live provider credential preflight should not write stdout.");
    if (!stderr.includes("live provider smoke requires CLARISSIMI_PROVIDER_TOKEN and CLARISSIMI_PROVIDER_MODEL.")) {
      throw new Error("live provider credential preflight should explain missing credentials.");
    }

    if (!stderr.includes("No provider call was made.")) {
      throw new Error("live provider credential preflight should confirm no provider call was made.");
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

async function withTempDir(prefix, callback) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
