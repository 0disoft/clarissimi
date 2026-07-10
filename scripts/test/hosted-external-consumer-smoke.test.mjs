import assert from "node:assert/strict";
import test from "node:test";

import { runHostedExternalConsumerSmoke } from "../hosted-external-consumer-smoke.mjs";

const exampleSha = "0123456789abcdef0123456789abcdef01234567";

test("hosted external consumer smoke dispatches and watches an immutable tag", async () => {
  const harness = createHarness({
    runs: [{
      databaseId: 12345,
      createdAt: "2026-07-10T00:00:10.000Z",
      headBranch: "main",
      headSha: "integration-lab-sha",
      status: "queued",
      conclusion: ""
    }]
  });

  const exitCode = await runHostedExternalConsumerSmoke([
    "--clarissimi-ref",
    "v0.1.1"
  ], harness.runtime);

  assert.equal(exitCode, 0);
  assert.deepEqual(harness.commands.map((entry) => [entry.command, ...entry.args.slice(0, 2)]), [
    ["gh", "--version"],
    ["gh", "workflow", "run"],
    ["gh", "run", "list"],
    ["gh", "run", "watch"]
  ]);
  const dispatch = harness.commands.find((entry) => entry.args[0] === "workflow");
  assert.equal(dispatch.args.includes("clarissimi-ref=v0.1.1"), true);
  assert.equal(
    harness.logs.includes(
      "hosted external consumer smoke passed for Clarissimi v0.1.1: "
      + "https://github.com/0disoft/integration-lab/actions/runs/12345"
    ),
    true
  );
});

test("hosted external consumer smoke defaults to the current HEAD SHA", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: [{
      databaseId: 23456,
      createdAt: "2026-07-10T00:00:10.000Z",
      headBranch: "main",
      headSha: "integration-lab-sha",
      status: "in_progress",
      conclusion: ""
    }]
  });

  const exitCode = await runHostedExternalConsumerSmoke([], harness.runtime);

  assert.equal(exitCode, 0);
  assert.deepEqual(harness.commands.slice(0, 2).map((entry) => [entry.command, ...entry.args]), [
    ["git", "rev-parse", "HEAD"],
    ["gh", "--version"]
  ]);
  const dispatch = harness.commands.find((entry) => entry.args[0] === "workflow");
  assert.equal(dispatch.args.includes(`clarissimi-ref=${exampleSha}`), true);
});

test("hosted external consumer smoke rejects mutable or malformed inputs before dispatch", async () => {
  const mutableRef = createHarness({});
  const mutableRefExitCode = await runHostedExternalConsumerSmoke([
    "--clarissimi-ref",
    "main"
  ], mutableRef.runtime);

  assert.equal(mutableRefExitCode, 2);
  assert.equal(
    mutableRef.errors.includes(
      "--clarissimi-ref must be a semantic version tag or 40-character commit SHA; moving refs are rejected."
    ),
    true
  );
  assert.equal(mutableRef.commands.length, 0);

  const invalidRepo = createHarness({});
  const invalidRepoExitCode = await runHostedExternalConsumerSmoke([
    "--clarissimi-ref",
    "v0.1.1",
    "--repo",
    "owner-only"
  ], invalidRepo.runtime);

  assert.equal(invalidRepoExitCode, 2);
  assert.equal(invalidRepo.errors.includes("--repo must use owner/name format."), true);
  assert.equal(invalidRepo.commands.length, 0);
});

test("hosted external consumer smoke fails before watching an invalid run id", async () => {
  const harness = createHarness({
    runs: [{
      databaseId: null,
      createdAt: "2026-07-10T00:00:10.000Z",
      headBranch: "main",
      headSha: "integration-lab-sha",
      status: "queued",
      conclusion: ""
    }]
  });

  const exitCode = await runHostedExternalConsumerSmoke([
    "--clarissimi-ref",
    "v0.1.1"
  ], harness.runtime);

  assert.equal(exitCode, 1);
  assert.equal(
    harness.errors.includes("Dispatched clarissimi.yml run is missing a valid databaseId."),
    true
  );
  assert.equal(
    harness.commands.some((entry) => entry.args[0] === "run" && entry.args[1] === "watch"),
    false
  );
});

function createHarness(options) {
  const commands = [];
  const logs = [];
  const errors = [];
  let now = Date.parse("2026-07-10T00:00:30.000Z");

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

        if (command === "git" && matches(args, ["rev-parse", "HEAD"])) {
          return options.headSha === undefined
            ? failure("missing head sha")
            : success(`${options.headSha}\n`);
        }

        if (command !== "gh") {
          return failure(`unexpected command: ${command}`);
        }

        if (matches(args, ["--version"])) {
          return success("gh version fake\n");
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
