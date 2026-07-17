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

test("publishes an immutable stable release for Marketplace distribution", async () => {
  const runtime = fakeRuntime({ version: "v0.3.0", releaseKind: "stable" });
  const exitCode = await runPublishActionRelease(
    ["--version", "v0.3.0", "--sha", sha, "--release-kind", "stable"],
    runtime,
  );

  assert.equal(exitCode, 0);
  const createRelease = runtime.calls.find(
    (call) => call.command === "gh" && call.args[0] === "release" && call.args[1] === "create",
  );
  assert.ok(createRelease);
  assert.equal(createRelease.args.includes("--prerelease"), false);
  assert.equal(JSON.parse(runtime.logs.at(-1)).releaseKind, "stable");
});

test("rejects unsupported release kinds before publication", async () => {
  const runtime = fakeRuntime();
  const exitCode = await runPublishActionRelease(
    ["--version", "v0.2.0", "--sha", sha, "--release-kind", "rolling"],
    runtime,
  );

  assert.equal(exitCode, 2);
  assert.match(runtime.errors.at(-2), /supports prerelease or stable/);
  assert.equal(runtime.calls.length, 0);
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

test("rejects candidate release-reference drift before remote mutation", async (testContext) => {
  const cases = [
    {
      name: "README misses the requested immutable Action reference",
      candidateFiles: {
        "README.md": "- uses: 0disoft/clarissimi@v0.1.9",
      },
      error: /Candidate README\.md must contain 0disoft\/clarissimi@v0\.2\.0/,
    },
    {
      name: "Action guide retains another immutable release reference",
      candidateFiles: {
        "docs/github-action/README.md": [
          "- uses: 0disoft/clarissimi@v0.2.0",
          "- uses: 0disoft/clarissimi@v0.1.9",
        ].join("\n"),
      },
      error: /contains stale immutable Action references \(v0\.1\.9\)/,
    },
    {
      name: "security policy misses the requested supported release",
      candidateFiles: {
        "SECURITY.md": "Supported immutable release `v0.1.9`.",
      },
      error: /Candidate SECURITY\.md must identify `v0\.2\.0`/,
    },
  ];

  for (const testCase of cases) {
    await testContext.test(testCase.name, async () => {
      const runtime = fakeRuntime({ candidateFiles: testCase.candidateFiles });
      const exitCode = await runPublishActionRelease(
        ["--version", "v0.2.0", "--sha", sha],
        runtime,
      );

      assert.equal(exitCode, 1);
      assert.match(runtime.errors.at(-1), testCase.error);
      assert.equal(
        runtime.calls.some(
          (call) => call.command === "git" && ["tag", "push"].includes(call.args[0]),
        ),
        false,
      );
      assert.equal(
        runtime.calls.some((call) => call.command === "gh" && call.args[0] === "release"),
        false,
      );
    });
  }
});

function fakeRuntime(options = {}) {
  const calls = [];
  const logs = [];
  const errors = [];
  let releaseCreated = false;
  const version = options.version ?? "v0.2.0";
  const isPrerelease = (options.releaseKind ?? "prerelease") === "prerelease";
  const candidateFiles = {
    "README.md": `- uses: 0disoft/clarissimi@${version}`,
    "docs/github-action/README.md": `- uses: 0disoft/clarissimi@${version}`,
    "SECURITY.md": `Supported immutable release \`${version}\`.`,
    ...options.candidateFiles,
  };
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
      if (command === "git" && args[0] === "show") {
        const separator = args[1].indexOf(":");
        const path = separator === -1 ? "" : args[1].slice(separator + 1);
        return path in candidateFiles ? ok(candidateFiles[path]) : fail(`missing ${path}`);
      }
      if (command === "gh" && args[0] === "api") return ok(sha);
      if (command === "gh" && args[0] === "issue" && args[1] === "list") {
        return ok(
          JSON.stringify([
            {
              number: 10,
              title: `Release candidate evidence for ${version} at ${sha.slice(0, 7)}`,
              body: `Candidate \`${sha}\`; version \`${version}\``,
              url: "https://github.com/0disoft/clarissimi/issues/10",
              state: "OPEN",
            },
          ]),
        );
      }
      if (command === "git" && args[0] === "ls-remote") {
        return options.remoteTagSha === undefined
          ? ok()
          : ok(`${options.remoteTagSha}\trefs/tags/${version}^{}`);
      }
      if (command === "git" && args[0] === "rev-parse") return fail("unknown revision");
      if (command === "git" && args[0] === "tag") return ok();
      if (command === "git" && args[0] === "push") return ok();
      if (command === "gh" && args[0] === "release" && args[1] === "view") {
        return releaseCreated
          ? ok(
              JSON.stringify({
                tagName: version,
                isDraft: false,
                isPrerelease,
                url: `https://github.com/0disoft/clarissimi/releases/tag/${version}`,
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
