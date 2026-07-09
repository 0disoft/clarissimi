import assert from "node:assert/strict";
import test from "node:test";

import { runHostedLiveProviderSmoke } from "../hosted-live-provider-smoke.mjs";

test("hosted live provider smoke stops before dispatch when the repository secret is missing", async () => {
  const harness = createHarness({
    secrets: []
  });

  const exitCode = await runHostedLiveProviderSmoke([
    "--model",
    "gpt-4.1-mini"
  ], harness.runtime);

  assert.equal(exitCode, 1);
  assert.match(
    harness.errors.join("\n"),
    /Missing repository secret CLARISSIMI_PROVIDER_TOKEN .* No workflow was dispatched\./
  );
  assert.equal(
    harness.commands.some((command) => command.args[0] === "workflow" && command.args[1] === "run"),
    false
  );
});

test("hosted live provider smoke dispatches and watches the selected workflow", async () => {
  const harness = createHarness({
    secrets: [{ name: "CLARISSIMI_PROVIDER_TOKEN" }],
    runs: [{
      databaseId: 12345,
      createdAt: "2026-07-09T00:00:10.000Z",
      headBranch: "release-candidate",
      headSha: "abc123",
      status: "completed",
      conclusion: "success"
    }]
  });

  const exitCode = await runHostedLiveProviderSmoke([
    "--",
    "--model",
    "minimax-m3",
    "--endpoint",
    "https://gateway.example/v1/chat/completions",
    "--thinking",
    "disabled",
    "--repo",
    "owner/repo",
    "--ref",
    "release-candidate"
  ], harness.runtime);

  assert.equal(exitCode, 0);
  assert.deepEqual(harness.commands.map((command) => command.args.slice(0, 2)), [
    ["--version"],
    ["secret", "list"],
    ["workflow", "run"],
    ["run", "list"],
    ["run", "watch"]
  ]);

  const workflowRun = harness.commands.find((command) =>
    command.args[0] === "workflow" && command.args[1] === "run"
  );
  assert.deepEqual(workflowRun.args, [
    "workflow",
    "run",
    "clarissimi-live-provider-smoke.yml",
    "--repo",
    "owner/repo",
    "--ref",
    "release-candidate",
    "-f",
    "provider-model=minimax-m3",
    "-f",
    "provider-endpoint=https://gateway.example/v1/chat/completions",
    "-f",
    "provider-thinking=disabled"
  ]);

  const runList = harness.commands.find((command) =>
    command.args[0] === "run" && command.args[1] === "list"
  );
  assert.equal(runList.args.includes("--branch"), true);
  assert.equal(runList.args[runList.args.indexOf("--branch") + 1], "release-candidate");

  const runWatch = harness.commands.find((command) =>
    command.args[0] === "run" && command.args[1] === "watch"
  );
  assert.deepEqual(runWatch.args, [
    "run",
    "watch",
    "12345",
    "--repo",
    "owner/repo",
    "--exit-status"
  ]);
  assert.equal(runWatch.options.inherit, true);
  assert.equal(harness.logs.some((line) => line.includes("hosted live provider smoke passed")), true);
});

function createHarness(options) {
  const commands = [];
  const logs = [];
  const errors = [];
  let now = Date.parse("2026-07-09T00:00:30.000Z");

  return {
    commands,
    logs,
    errors,
    runtime: {
      now: () => now,
      delay: async (ms) => {
        now += ms;
      },
      log: (message) => {
        logs.push(message);
      },
      error: (message) => {
        errors.push(message);
      },
      runCommand: async (command, args, commandOptions = {}) => {
        commands.push({ command, args, options: commandOptions });

        if (command !== "gh") {
          return failure(`unexpected command: ${command}`);
        }

        if (args.length === 1 && args[0] === "--version") {
          return success("gh version fake\n");
        }

        if (matches(args, ["secret", "list"])) {
          return success(`${JSON.stringify(options.secrets ?? [])}\n`);
        }

        if (matches(args, ["workflow", "run"])) {
          return success("");
        }

        if (matches(args, ["run", "list"])) {
          return success(`${JSON.stringify(options.runs ?? [])}\n`);
        }

        if (matches(args, ["run", "watch"])) {
          return success("");
        }

        return failure(`unexpected gh args: ${args.join(" ")}`);
      }
    }
  };
}

function matches(args, prefix) {
  return prefix.every((value, index) => args[index] === value);
}

function success(stdout) {
  return {
    exitCode: 0,
    stdout,
    stderr: ""
  };
}

function failure(stderr) {
  return {
    exitCode: 1,
    stdout: "",
    stderr
  };
}
