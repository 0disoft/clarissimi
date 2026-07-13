import assert from "node:assert/strict";
import test from "node:test";

import { runPublishActionRelease } from "../publish-action-release.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";

test("publishes an immutable pre-release from one matching evidence issue", async () => {
  const runtime = fakeRuntime();
  const exitCode = await runPublishActionRelease(["--version", "v0.2.0", "--sha", sha], runtime);

  assert.equal(exitCode, 0);
  assert.equal(
    runtime.calls.some((call) => call.command === "git" && call.args[0] === "tag"),
    true,
  );
  assert.equal(
    runtime.calls.some((call) => call.command === "git" && call.args[0] === "push"),
    true,
  );
  const createRelease = runtime.calls.find(
    (call) => call.command === "gh" && call.args[0] === "release" && call.args[1] === "create",
  );
  assert.ok(createRelease);
  assert.match(
    createRelease.options.input,
    /https:\/\/github\.com\/0disoft\/clarissimi\/issues\/10/,
  );
  assert.match(createRelease.options.input, new RegExp(sha));
  assert.equal(
    runtime.calls.some(
      (call) => call.command === "gh" && call.args[0] === "issue" && call.args[1] === "close",
    ),
    true,
  );
});

test("rejects a remote tag that points to another commit before publication", async () => {
  const runtime = fakeRuntime({ remoteTagSha: "ffffffffffffffffffffffffffffffffffffffff" });
  const exitCode = await runPublishActionRelease(["--version", "v0.2.0", "--sha", sha], runtime);

  assert.equal(exitCode, 1);
  assert.match(runtime.errors.at(-1), /Remote tag v0\.2\.0 points to/);
  assert.equal(
    runtime.calls.some(
      (call) => call.command === "gh" && call.args[0] === "release" && call.args[1] === "create",
    ),
    false,
  );
});

function fakeRuntime(options = {}) {
  const calls = [];
  const logs = [];
  const errors = [];
  let releaseCreated = false;
  return {
    calls,
    logs,
    errors,
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
    readText: async () =>
      "Clarissimi {{VERSION}}\nEvidence: {{EVIDENCE_ISSUE_URL}}\nCommit: {{SHA}}\n",
    runCommand: async (command, args, commandOptions = {}) => {
      calls.push({ command, args, options: commandOptions });
      if (command === "gh" && args[0] === "--version") return ok("gh version 2");
      if (command === "git" && args[0] === "status") return ok();
      if (command === "gh" && args[0] === "api") return ok(sha);
      if (command === "gh" && args[0] === "issue" && args[1] === "list") {
        return ok(
          JSON.stringify([
            {
              number: 10,
              title: `Release candidate evidence for v0.2.0 at ${sha.slice(0, 7)}`,
              body: `Candidate \`${sha}\`; version \`v0.2.0\``,
              url: "https://github.com/0disoft/clarissimi/issues/10",
              state: "OPEN",
            },
          ]),
        );
      }
      if (command === "git" && args[0] === "ls-remote") {
        return options.remoteTagSha === undefined
          ? ok()
          : ok(`${options.remoteTagSha}\trefs/tags/v0.2.0^{}`);
      }
      if (command === "git" && args[0] === "rev-parse") return fail("unknown revision");
      if (command === "git" && args[0] === "tag") return ok();
      if (command === "git" && args[0] === "push") return ok();
      if (command === "gh" && args[0] === "release" && args[1] === "view") {
        return releaseCreated
          ? ok(
              JSON.stringify({
                tagName: "v0.2.0",
                isDraft: false,
                isPrerelease: true,
                url: "https://github.com/0disoft/clarissimi/releases/tag/v0.2.0",
              }),
            )
          : fail("release not found");
      }
      if (command === "gh" && args[0] === "release" && args[1] === "create") {
        releaseCreated = true;
        return ok();
      }
      if (command === "gh" && args[0] === "issue" && args[1] === "close") return ok();
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
}

function ok(stdout = "") {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr) {
  return { exitCode: 1, stdout: "", stderr };
}
