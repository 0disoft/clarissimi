import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseCandidateEvidenceOrchestrator } from "../release-candidate-evidence-orchestrator.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";

test("defaults to evidence preview and records every successful run", async () => {
  const runtime = fakeRuntime();
  const exitCode = await runReleaseCandidateEvidenceOrchestrator(["--provider-model", "gpt-4.1-mini", "--sha", sha], runtime);
  assert.equal(exitCode, 0);
  const evidence = runtime.calls.find((call) => call.command === "pnpm");
  assert.ok(evidence.args.includes("--print"));
  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
  assert.match(runtime.logs.at(-1), /"orphanAudit": 105/);
});

test("create-issue is explicit and omits preview flag", async () => {
  const runtime = fakeRuntime();
  assert.equal(await runReleaseCandidateEvidenceOrchestrator(["--provider-model", "gpt-4.1-mini", "--sha", sha, "--create-issue"], runtime), 0);
  assert.equal(runtime.calls.find((call) => call.command === "pnpm").args.includes("--print"), false);
});

test("runs orphan audit after a full-write failure", async () => {
  const runtime = fakeRuntime({ failWatchId: 104 });
  assert.equal(await runReleaseCandidateEvidenceOrchestrator(["--provider-model", "gpt-4.1-mini", "--sha", sha], runtime), 1);
  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
  assert.equal(runtime.calls.some((call) => call.command === "pnpm"), false);
});

test("rejects a mismatched source-only external ref before dispatch", async () => {
  const runtime = fakeRuntime();
  assert.equal(await runReleaseCandidateEvidenceOrchestrator(["--provider-model", "gpt-4.1-mini", "--sha", sha, "--external-ref", "v0.1.1"], runtime), 2);
  assert.equal(runtime.calls.length, 0);
});

function fakeRuntime(options = {}) {
  let now = Date.parse("2026-07-11T00:00:00Z");
  let nextRun = 102;
  const calls = [];
  const logs = [];
  const errors = [];
  const watched = [];
  return {
    calls, logs, errors, watched,
    now: () => now,
    delay: async (ms) => { now += ms; },
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
    runCommand: async (command, args) => {
      calls.push({ command, args });
      if (command === "gh" && args[0] === "--version") return ok("gh version 2");
      if (command === "gh" && args[0] === "secret") return ok('[{"name":"CLARISSIMI_PROVIDER_TOKEN"}]');
      if (command === "gh" && args[0] === "workflow") return ok();
      if (command === "gh" && args[0] === "run" && args[1] === "list") {
        const isCi = args.includes("CI");
        const id = isCi ? 101 : nextRun++;
        return ok(JSON.stringify([{ databaseId: id, status: isCi ? "completed" : "queued", conclusion: isCi ? "success" : "", headSha: sha, url: `https://example.test/${id}`, createdAt: new Date(now).toISOString() }]));
      }
      if (command === "gh" && args[0] === "run" && args[1] === "watch") {
        const id = Number(args[2]); watched.push(id);
        return options.failWatchId === id ? { exitCode: 1, stdout: "", stderr: "failed" } : ok();
      }
      if (command === "pnpm") return ok();
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    }
  };
}

function ok(stdout = "") { return { exitCode: 0, stdout, stderr: "" }; }
