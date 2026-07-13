import assert from "node:assert/strict";
import test from "node:test";

import { runPromoteActionMajorAlias } from "../promote-action-major-alias.mjs";

const targetSha = "0123456789abcdef0123456789abcdef01234567";
const oldSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("creates v0 with an absence lease and validates the promoted alias", async () => {
  const harness = createHarness();
  const exitCode = await runPromoteActionMajorAlias(args(), harness.runtime);

  assert.equal(exitCode, 0);
  assert.equal(harness.aliasSha, targetSha);
  assert.equal(
    harness.calls.some(
      ({ command, args: commandArgs }) =>
        command === "git" &&
        commandArgs.includes("--force-with-lease=refs/tags/v0:") &&
        commandArgs.includes(`${targetSha}:refs/tags/v0`),
    ),
    true,
  );
  assert.equal(
    harness.calls.some(
      ({ command, args: commandArgs }) =>
        command === "pnpm" && commandArgs.includes("major-alias") && commandArgs.includes("v0"),
    ),
    true,
  );
});

test("moves an existing v0 only with the recorded SHA lease", async () => {
  const harness = createHarness({ aliasSha: oldSha });
  const exitCode = await runPromoteActionMajorAlias(args(), harness.runtime);

  assert.equal(exitCode, 0);
  assert.equal(harness.aliasSha, targetSha);
  assert.equal(
    harness.calls.some(
      ({ args: commandArgs }) =>
        commandArgs.includes(`--force-with-lease=refs/tags/v0:${oldSha}`) &&
        commandArgs.includes(`${targetSha}:refs/tags/v0`),
    ),
    true,
  );
});

test("rolls v0 back when post-promotion evidence fails", async () => {
  const harness = createHarness({ aliasSha: oldSha, failEvidence: true });
  const exitCode = await runPromoteActionMajorAlias(args(), harness.runtime);

  assert.equal(exitCode, 1);
  assert.equal(harness.aliasSha, oldSha);
  assert.match(harness.errors.at(-1), /rolled back/);
  assert.equal(
    harness.calls.some(
      ({ args: commandArgs }) =>
        commandArgs.includes(`--force-with-lease=refs/tags/v0:${targetSha}`) &&
        commandArgs.includes(`${oldSha}:refs/tags/v0`),
    ),
    true,
  );
});

test("deletes a newly created alias when post-promotion evidence fails", async () => {
  const harness = createHarness({ failEvidence: true });
  const exitCode = await runPromoteActionMajorAlias(args(), harness.runtime);

  assert.equal(exitCode, 1);
  assert.equal(harness.aliasSha, undefined);
  assert.equal(
    harness.calls.some(
      ({ args: commandArgs }) =>
        commandArgs.includes(`--force-with-lease=refs/tags/v0:${targetSha}`) &&
        commandArgs.includes(":refs/tags/v0"),
    ),
    true,
  );
});

test("revalidates an alias already at the target without rewriting it", async () => {
  const harness = createHarness({ aliasSha: targetSha });
  const exitCode = await runPromoteActionMajorAlias(args(), harness.runtime);

  assert.equal(exitCode, 0);
  assert.equal(
    harness.calls.filter(
      ({ command, args: commandArgs }) => command === "git" && commandArgs[0] === "push",
    ).length,
    0,
  );
});

function args() {
  return ["--release-version", "v0.2.0", "--sha", targetSha];
}

function createHarness(options = {}) {
  let aliasSha = options.aliasSha;
  const calls = [];
  const logs = [];
  const errors = [];
  const runtime = {
    log: (value) => logs.push(value),
    error: (value) => errors.push(value),
    runCommand: async (command, commandArgs, commandOptions = {}) => {
      calls.push({ command, args: commandArgs, options: commandOptions });
      if (commandArgs[0] === "--version") return ok(`${command} fake`);
      if (command === "git" && commandArgs[0] === "status") return ok();
      if (command === "git" && commandArgs[0] === "cat-file") return ok();
      if (command === "git" && commandArgs[0] === "ls-remote") {
        const tag = commandArgs.at(-2).replace("refs/tags/", "");
        if (tag === "v0.2.0") {
          return ok(
            `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v0.2.0\n${targetSha}\trefs/tags/v0.2.0^{}`,
          );
        }
        return aliasSha === undefined ? ok() : ok(`${aliasSha}\trefs/tags/v0`);
      }
      if (command === "gh" && commandArgs[0] === "release") {
        return ok(
          JSON.stringify({
            tagName: "v0.2.0",
            isDraft: false,
            url: "https://github.com/0disoft/clarissimi/releases/tag/v0.2.0",
          }),
        );
      }
      if (command === "gh" && commandArgs[0] === "workflow") return ok();
      if (command === "git" && commandArgs[0] === "push") {
        const refspec = commandArgs.at(-1);
        aliasSha = refspec.startsWith(":") ? undefined : refspec.split(":")[0];
        return ok();
      }
      if (command === "pnpm" && commandArgs.includes("verify-action-major-tag")) return ok();
      if (command === "pnpm" && commandArgs.includes("release-candidate-evidence-orchestrator")) {
        return options.failEvidence ? fail("hosted evidence failed") : ok();
      }
      return fail(`unexpected command: ${command} ${commandArgs.join(" ")}`);
    },
  };
  return {
    runtime,
    calls,
    logs,
    errors,
    get aliasSha() {
      return aliasSha;
    },
  };
}

function ok(stdout = "") {
  return { exitCode: 0, stdout, stderr: "" };
}
function fail(stderr) {
  return { exitCode: 1, stdout: "", stderr };
}
