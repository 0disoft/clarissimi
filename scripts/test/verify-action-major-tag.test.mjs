import assert from "node:assert/strict";
import test from "node:test";

import { runVerifyActionMajorTag } from "../verify-action-major-tag.mjs";

const expectedSha = "0123456789abcdef0123456789abcdef01234567";

test("verify action major tag accepts matching alias, immutable tag, and release", async () => {
  const harness = createHarness();
  const exitCode = await runVerifyActionMajorTag(
    ["--release-version", "v0.1.1", "--sha", expectedSha],
    harness.runtime,
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(
    harness.commands.map(({ command, args }) => [command, ...args.slice(0, 2)]),
    [
      ["git", "--version"],
      ["gh", "--version"],
      ["git", "ls-remote", "--tags"],
      ["gh", "release", "view"],
    ],
  );
  assert.equal(
    harness.logs.includes(
      `Action major alias v0 verified at ${expectedSha} through immutable tag v0.1.1: ` +
        "https://github.com/0disoft/clarissimi/releases/tag/v0.1.1",
    ),
    true,
  );
});

test("verify action major tag rejects unsupported aliases and malformed inputs", async () => {
  const badAlias = createHarness();
  assert.equal(
    await runVerifyActionMajorTag(
      ["--alias", "v1", "--release-version", "v0.1.1", "--sha", expectedSha],
      badAlias.runtime,
    ),
    2,
  );
  assert.equal(
    badAlias.errors.includes("--alias must be v0 under the current release policy."),
    true,
  );
  assert.equal(badAlias.commands.length, 0);

  const badVersion = createHarness();
  assert.equal(
    await runVerifyActionMajorTag(
      ["--release-version", "v0.1.1-rc.1", "--sha", expectedSha],
      badVersion.runtime,
    ),
    2,
  );
  assert.equal(
    badVersion.errors.includes("--release-version must be an immutable v0.x.y tag."),
    true,
  );
  assert.equal(badVersion.commands.length, 0);
});

test("verify action major tag rejects a mismatched moving alias", async () => {
  const harness = createHarness({
    aliasSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const exitCode = await runVerifyActionMajorTag(
    ["--release-version", "v0.1.1", "--sha", expectedSha],
    harness.runtime,
  );

  assert.equal(exitCode, 1);
  assert.equal(
    harness.errors.includes(
      `Remote Action tag v0 resolves to aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, expected ${expectedSha}.`,
    ),
    true,
  );
  assert.equal(
    harness.commands.some(({ command }) => command === "gh"),
    true,
  );
  assert.equal(
    harness.commands.some(({ args }) => args[0] === "release"),
    false,
  );
});

test("verify action major tag rejects missing or draft release metadata", async () => {
  const harness = createHarness({ release: { isDraft: true } });
  const exitCode = await runVerifyActionMajorTag(
    ["--release-version", "v0.1.1", "--sha", expectedSha],
    harness.runtime,
  );

  assert.equal(exitCode, 1);
  assert.equal(harness.errors.includes("GitHub Release v0.1.1 must not be a draft."), true);
});

function createHarness(options = {}) {
  const commands = [];
  const logs = [];
  const errors = [];
  const aliasSha = options.aliasSha ?? expectedSha;
  const versionTagObject = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const release = {
    tagName: "v0.1.1",
    isDraft: false,
    isPrerelease: true,
    url: "https://github.com/0disoft/clarissimi/releases/tag/v0.1.1",
    ...options.release,
  };

  return {
    commands,
    logs,
    errors,
    runtime: {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
      runCommand: async (command, args) => {
        commands.push({ command, args });
        if (args[0] === "--version") {
          return success(`${command} fake\n`);
        }
        if (command === "git" && args[0] === "ls-remote") {
          return success(
            [
              `${aliasSha}\trefs/tags/v0`,
              `${versionTagObject}\trefs/tags/v0.1.1`,
              `${expectedSha}\trefs/tags/v0.1.1^{}`,
              "",
            ].join("\n"),
          );
        }
        if (command === "gh" && args[0] === "release" && args[1] === "view") {
          return success(`${JSON.stringify(release)}\n`);
        }
        return failure(`unexpected command: ${command} ${args.join(" ")}`);
      },
    },
  };
}

function success(stdout) {
  return { exitCode: 0, stdout, stderr: "" };
}

function failure(stderr) {
  return { exitCode: 1, stdout: "", stderr };
}
