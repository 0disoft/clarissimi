import assert from "node:assert/strict";
import test from "node:test";

import { runHostedCiValidation } from "../hosted-ci-validation.mjs";

const exampleSha = "0123456789abcdef0123456789abcdef01234567";

test("hosted CI validation passes for a completed successful workflow run", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: [
      {
        databaseId: 12345,
        status: "completed",
        conclusion: "success",
        headSha: exampleSha,
        url: "https://github.com/owner/repo/actions/runs/12345",
        createdAt: "2026-07-09T00:00:10.000Z",
      },
    ],
  });

  const exitCode = await runHostedCiValidation(
    [
      "--",
      "--repo",
      "owner/repo",
      "--branch",
      "release-candidate",
      "--sha",
      exampleSha,
      "--workflow",
      "CI",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(
    harness.commands.map((command) => command.args.slice(0, 2)),
    [["--version"], ["run", "list"]],
  );
  assert.equal(
    harness.logs.includes(
      "hosted CI validation passed: https://github.com/owner/repo/actions/runs/12345",
    ),
    true,
  );
});

test("hosted CI validation resolves HEAD and watches an in-progress workflow run", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: [
      {
        databaseId: 23456,
        status: "in_progress",
        conclusion: "",
        headSha: exampleSha,
        url: "https://github.com/0disoft/clarissimi/actions/runs/23456",
        createdAt: "2026-07-09T00:00:10.000Z",
      },
    ],
  });

  const exitCode = await runHostedCiValidation([], harness.runtime);

  assert.equal(exitCode, 0);
  assert.deepEqual(
    harness.commands.map((command) => [command.command, ...command.args.slice(0, 2)]),
    [
      ["git", "rev-parse", "HEAD"],
      ["gh", "--version"],
      ["gh", "run", "list"],
      ["gh", "run", "watch"],
    ],
  );

  const runList = harness.commands.find(
    (command) =>
      command.command === "gh" && command.args[0] === "run" && command.args[1] === "list",
  );
  assert.equal(runList.args.includes("--workflow"), true);
  assert.equal(runList.args[runList.args.indexOf("--workflow") + 1], "CI");
  assert.equal(runList.args.includes("--branch"), true);
  assert.equal(runList.args[runList.args.indexOf("--branch") + 1], "main");

  const runWatch = harness.commands.find(
    (command) =>
      command.command === "gh" && command.args[0] === "run" && command.args[1] === "watch",
  );
  assert.deepEqual(runWatch.args, [
    "run",
    "watch",
    "23456",
    "--repo",
    "0disoft/clarissimi",
    "--exit-status",
  ]);
  assert.equal(runWatch.options.inherit, true);
});

test("hosted CI validation rejects invalid inputs before calling git or gh", async () => {
  const invalidRepo = createHarness({ headSha: exampleSha });
  const invalidRepoExitCode = await runHostedCiValidation(
    ["--repo", "owner-only", "--sha", exampleSha],
    invalidRepo.runtime,
  );

  assert.equal(invalidRepoExitCode, 2);
  assert.equal(invalidRepo.errors.includes("--repo must use owner/name format."), true);
  assert.equal(invalidRepo.commands.length, 0);

  const invalidSha = createHarness({ headSha: exampleSha });
  const invalidShaExitCode = await runHostedCiValidation(["--sha", "abc123"], invalidSha.runtime);

  assert.equal(invalidShaExitCode, 2);
  assert.equal(invalidSha.errors.includes("--sha must be a 40-character commit SHA."), true);
  assert.equal(invalidSha.commands.length, 0);

  const conflictingBranchAliases = createHarness({ headSha: exampleSha });
  const conflictingBranchAliasesExitCode = await runHostedCiValidation(
    ["--branch", "main", "--ref", "release-candidate", "--sha", exampleSha],
    conflictingBranchAliases.runtime,
  );

  assert.equal(conflictingBranchAliasesExitCode, 2);
  assert.equal(
    conflictingBranchAliases.errors.includes(
      "--branch and --ref must match when both are provided.",
    ),
    true,
  );
  assert.equal(conflictingBranchAliases.commands.length, 0);
});

test("hosted CI validation fails for completed unsuccessful workflow runs", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: [
      {
        databaseId: 34567,
        status: "completed",
        conclusion: "failure",
        headSha: exampleSha,
        url: "https://github.com/owner/repo/actions/runs/34567",
        createdAt: "2026-07-09T00:00:10.000Z",
      },
    ],
  });

  const exitCode = await runHostedCiValidation(
    ["--repo", "owner/repo", "--sha", exampleSha],
    harness.runtime,
  );

  assert.equal(exitCode, 1);
  assert.equal(
    harness.errors.includes(
      "Hosted CI validation failed for 0123456789abcdef0123456789abcdef01234567: conclusion=failure (https://github.com/owner/repo/actions/runs/34567).",
    ),
    true,
  );
  assert.equal(
    harness.commands.some(
      (command) =>
        command.command === "gh" && command.args[0] === "run" && command.args[1] === "watch",
    ),
    false,
  );
});

test("hosted CI validation rejects malformed workflow run metadata", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: [
      {
        databaseId: null,
        status: "completed",
        conclusion: "success",
        headSha: exampleSha,
        url: "https://github.com/owner/repo/actions/runs/45678",
        createdAt: "2026-07-09T00:00:10.000Z",
      },
    ],
  });

  const exitCode = await runHostedCiValidation(
    ["--repo", "owner/repo", "--sha", exampleSha],
    harness.runtime,
  );

  assert.equal(exitCode, 1);
  assert.equal(
    harness.errors.includes(
      "CI workflow run for 0123456789abcdef0123456789abcdef01234567 is missing a valid databaseId.",
    ),
    true,
  );
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

        if (
          command === "git" &&
          args.length === 2 &&
          args[0] === "rev-parse" &&
          args[1] === "HEAD"
        ) {
          return success(`${options.headSha}\n`);
        }

        if (command !== "gh") {
          return failure(`unexpected command: ${command}`);
        }

        if (args.length === 1 && args[0] === "--version") {
          return success("gh version fake\n");
        }

        if (matches(args, ["run", "list"])) {
          return success(`${JSON.stringify(options.runs ?? [])}\n`);
        }

        if (matches(args, ["run", "watch"])) {
          return success("");
        }

        return failure(`unexpected gh args: ${args.join(" ")}`);
      },
    },
  };
}

function matches(args, prefix) {
  return prefix.every((value, index) => args[index] === value);
}

function success(stdout) {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
  };
}

function failure(stderr) {
  return {
    exitCode: 1,
    stdout: "",
    stderr,
  };
}
