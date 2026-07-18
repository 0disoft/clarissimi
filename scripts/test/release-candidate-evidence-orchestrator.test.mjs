import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseCandidateEvidenceOrchestrator } from "../release-candidate-evidence-orchestrator.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const evidenceId = "0123456789abcdef0123456789abcdef";

test("defaults to evidence preview and records every successful run", async () => {
  const runtime = fakeRuntime();
  const exitCode = await runReleaseCandidateEvidenceOrchestrator(
    ["--provider-model", "gpt-4.1-mini", "--sha", sha],
    runtime,
  );
  assert.equal(exitCode, 0);
  const evidence = runtime.calls.find((call) => call.command === "pnpm");
  assert.ok(evidence.args.includes("--print"));
  assert.deepEqual(
    evidence.args.slice(
      evidence.args.indexOf("--evidence-id"),
      evidence.args.indexOf("--evidence-id") + 2,
    ),
    ["--evidence-id", evidenceId],
  );
  const dispatches = runtime.calls.filter(
    (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
  );
  assert.equal(
    dispatches.every((call) => call.args.includes(`evidence-id=${evidenceId}`)),
    true,
  );
  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
  assert.match(runtime.logs.at(-1), /"orphanAudit": 105/);
});

test("create-issue is explicit and omits preview flag", async () => {
  const runtime = fakeRuntime();
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha, "--create-issue"],
      runtime,
    ),
    0,
  );
  assert.equal(
    runtime.calls.find((call) => call.command === "pnpm").args.includes("--print"),
    false,
  );
});

test("versioned evidence defaults external consumers to the pre-tag candidate SHA", async () => {
  const runtime = fakeRuntime();
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      [
        "--provider-model",
        "gpt-4.1-mini",
        "--sha",
        sha,
        "--release-type",
        "versioned-action-tag",
        "--release-version",
        "v0.2.0",
      ],
      runtime,
    ),
    0,
  );

  const dispatches = runtime.calls.filter(
    (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
  );
  const externalDispatches = dispatches.filter(
    (call) =>
      call.args.includes("clarissimi.yml") || call.args.includes("clarissimi-full-write-smoke.yml"),
  );
  assert.equal(
    externalDispatches.every((call) => call.args.includes(`clarissimi-ref=${sha}`)),
    true,
  );

  const evidence = runtime.calls.find((call) => call.command === "pnpm");
  assert.deepEqual(
    evidence.args.slice(
      evidence.args.indexOf("--external-ref"),
      evidence.args.indexOf("--external-ref") + 2,
    ),
    ["--external-ref", sha],
  );
  assert.deepEqual(
    evidence.args.slice(
      evidence.args.indexOf("--release-version"),
      evidence.args.indexOf("--release-version") + 2,
    ),
    ["--release-version", "v0.2.0"],
  );
});

test("Marketplace evidence defaults external consumers to the pre-tag candidate SHA", async () => {
  const runtime = fakeRuntime();
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      [
        "--provider-model",
        "gpt-4.1-mini",
        "--sha",
        sha,
        "--release-type",
        "marketplace-action-tag",
        "--release-version",
        "v0.3.0",
      ],
      runtime,
    ),
    0,
  );

  const dispatches = runtime.calls.filter(
    (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
  );
  const externalDispatches = dispatches.filter(
    (call) =>
      call.args.includes("clarissimi.yml") || call.args.includes("clarissimi-full-write-smoke.yml"),
  );
  assert.equal(
    externalDispatches.every((call) => call.args.includes(`clarissimi-ref=${sha}`)),
    true,
  );

  const evidence = runtime.calls.find((call) => call.command === "pnpm");
  assert.equal(evidence.args.includes("marketplace-action-tag"), true);
  assert.deepEqual(
    evidence.args.slice(
      evidence.args.indexOf("--release-version"),
      evidence.args.indexOf("--release-version") + 2,
    ),
    ["--release-version", "v0.3.0"],
  );
});

test("major alias evidence pins v0 to the expected SHA on both external workflows", async () => {
  const runtime = fakeRuntime({ externalRef: "v0" });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      [
        "--provider-model",
        "gpt-4.1-mini",
        "--sha",
        sha,
        "--release-type",
        "major-alias",
        "--release-version",
        "v0.2.0",
        "--external-ref",
        "v0",
      ],
      runtime,
    ),
    0,
  );

  const dispatches = runtime.calls.filter(
    (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
  );
  const externalDispatches = dispatches.filter(
    (call) =>
      call.args.includes("clarissimi.yml") || call.args.includes("clarissimi-full-write-smoke.yml"),
  );
  assert.equal(
    externalDispatches.every(
      (call) =>
        call.args.includes("clarissimi-ref=v0") && call.args.includes(`expected-sha=${sha}`),
    ),
    true,
  );
  const evidence = runtime.calls.find((call) => call.command === "pnpm");
  assert.equal(evidence.args.includes("major-alias"), true);
  const liveDispatch = dispatches.find((call) =>
    call.args.includes("clarissimi-live-provider-smoke.yml"),
  );
  assert.deepEqual(
    liveDispatch.args.slice(
      liveDispatch.args.indexOf("--ref"),
      liveDispatch.args.indexOf("--ref") + 2,
    ),
    ["--ref", "v0.2.0"],
  );
  assert.deepEqual(
    evidence.args.slice(
      evidence.args.indexOf("--live-ref"),
      evidence.args.indexOf("--live-ref") + 2,
    ),
    ["--live-ref", "v0.2.0"],
  );
  assert.deepEqual(
    evidence.args.slice(
      evidence.args.indexOf("--external-ref"),
      evidence.args.indexOf("--external-ref") + 2,
    ),
    ["--external-ref", "v0"],
  );
});

test("major alias evidence pins v1 to the expected SHA on both external workflows", async () => {
  const runtime = fakeRuntime({ externalRef: "v1" });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      [
        "--provider-model",
        "gpt-4.1-mini",
        "--sha",
        sha,
        "--release-type",
        "major-alias",
        "--release-version",
        "v1.0.0",
        "--external-ref",
        "v1",
      ],
      runtime,
    ),
    0,
  );

  const dispatches = runtime.calls.filter(
    (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
  );
  const externalDispatches = dispatches.filter(
    (call) =>
      call.args.includes("clarissimi.yml") || call.args.includes("clarissimi-full-write-smoke.yml"),
  );
  assert.equal(
    externalDispatches.every(
      (call) =>
        call.args.includes("clarissimi-ref=v1") && call.args.includes(`expected-sha=${sha}`),
    ),
    true,
  );
});

test("runs orphan audit after a full-write failure", async () => {
  const runtime = fakeRuntime({ failWatchId: 104 });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    1,
  );
  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
  assert.equal(
    runtime.calls.some((call) => call.command === "pnpm"),
    false,
  );
});

test("reports billing runner admission failures without dispatching an orphan audit", async () => {
  const runtime = fakeRuntime({ failWatchId: 104, runnerAdmissionFailureId: 104 });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    1,
  );

  assert.deepEqual(runtime.watched, [102, 103, 104]);
  assert.equal(
    runtime.calls.some(
      (call) =>
        call.command === "gh" &&
        call.args[0] === "workflow" &&
        call.args[1] === "run" &&
        call.args.includes("clarissimi-orphan-audit.yml"),
    ),
    false,
  );
  assert.match(runtime.errors.at(-1), /assigned no runner and ran no workflow steps/);
  assert.match(
    runtime.errors.at(-1),
    /included minutes to reset or resolve GitHub Billing & plans/,
  );
  assert.match(runtime.errors.at(-1), /orphan audit was not dispatched/);
  assert.match(runtime.errors.at(-1), /release gate remains failed/);
});

test("keeps the orphan audit for zero-step failures without a billing annotation", async () => {
  const runtime = fakeRuntime({
    failWatchId: 104,
    runnerAdmissionFailureId: 104,
    runnerAnnotation: "The job was cancelled by an administrator.",
  });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    1,
  );

  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
  assert.doesNotMatch(runtime.errors.at(-1), /assigned no runner/);
});

test("keeps the orphan audit when the failed jobs response is incomplete", async () => {
  const runtime = fakeRuntime({
    failWatchId: 104,
    runnerAdmissionFailureId: 104,
    runnerTotalCount: 2,
  });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    1,
  );

  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
  assert.doesNotMatch(runtime.errors.at(-1), /assigned no runner/);
});

test("rejects a mismatched source-only external ref before dispatch", async () => {
  const runtime = fakeRuntime();
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha, "--external-ref", "v0.1.1"],
      runtime,
    ),
    2,
  );
  assert.equal(runtime.calls.length, 0);
});

test("rejects a candidate ref that does not resolve to the requested SHA before dispatch", async () => {
  const runtime = fakeRuntime({
    resolvedSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    1,
  );
  assert.equal(
    runtime.calls.some(
      (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
    ),
    false,
  );
  assert.match(runtime.errors.at(-1), /No workflow was dispatched/);
});

test("preflights every workflow before checking the provider secret or dispatching", async () => {
  const runtime = fakeRuntime({
    missingWorkflow: "clarissimi-full-write-smoke.yml",
  });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    1,
  );
  assert.equal(
    runtime.calls.some((call) => call.command === "gh" && call.args[0] === "secret"),
    false,
  );
  assert.equal(
    runtime.calls.some(
      (call) => call.command === "gh" && call.args[0] === "workflow" && call.args[1] === "run",
    ),
    false,
  );
});

test("ignores a concurrent run for the same workflow when its correlation title differs", async () => {
  const runtime = fakeRuntime({ includeConcurrentDecoy: true });
  assert.equal(
    await runReleaseCandidateEvidenceOrchestrator(
      ["--provider-model", "gpt-4.1-mini", "--sha", sha],
      runtime,
    ),
    0,
  );
  assert.equal(runtime.watched.includes(900), false);
  assert.deepEqual(runtime.watched, [102, 103, 104, 105]);
});

function fakeRuntime(options = {}) {
  let now = Date.parse("2026-07-11T00:00:00Z");
  let nextRun = 102;
  const calls = [];
  const logs = [];
  const errors = [];
  const watched = [];
  return {
    calls,
    logs,
    errors,
    watched,
    now: () => now,
    randomEvidenceId: () => options.evidenceId ?? evidenceId,
    delay: async (ms) => {
      now += ms;
    },
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
    runCommand: async (command, args) => {
      calls.push({ command, args });
      if (command === "gh" && args[0] === "--version") return ok("gh version 2");
      if (
        command === "gh" &&
        args[0] === "api" &&
        args[1]?.includes("/actions/runs/") &&
        args[1]?.includes("/jobs?")
      ) {
        const runId = Number(args[1].match(/\/actions\/runs\/(\d+)\/jobs\?/)?.[1]);
        const admissionFailure = runId === options.runnerAdmissionFailureId;
        return ok(
          JSON.stringify({
            total_count: options.runnerTotalCount ?? 1,
            jobs: [
              admissionFailure
                ? { id: runId + 1_000, runner_id: 0, steps: [] }
                : {
                    id: runId + 1_000,
                    runner_id: 10,
                    steps: [{ name: "run", status: "completed", conclusion: "failure" }],
                  },
            ],
          }),
        );
      }
      if (command === "gh" && args[0] === "api" && args[1]?.includes("/check-runs/")) {
        return ok(
          JSON.stringify([
            {
              message:
                options.runnerAnnotation ??
                "The job was not started because recent account payments have failed or your spending limit needs to be increased.",
            },
          ]),
        );
      }
      if (command === "gh" && args[0] === "api") return ok(options.resolvedSha ?? sha);
      if (command === "gh" && args[0] === "workflow" && args[1] === "view") {
        return args.includes(options.missingWorkflow)
          ? { exitCode: 1, stdout: "", stderr: "workflow not found" }
          : ok("name: workflow");
      }
      if (command === "gh" && args[0] === "secret")
        return ok('[{"name":"CLARISSIMI_PROVIDER_TOKEN"}]');
      if (command === "gh" && args[0] === "workflow") return ok();
      if (command === "gh" && args[0] === "run" && args[1] === "list") {
        const isCi = args.includes("CI");
        const id = isCi ? 101 : nextRun++;
        const workflow = args[args.indexOf("--workflow") + 1];
        const externalRef = options.externalRef ?? sha;
        const displayTitle =
          workflow === "clarissimi-live-provider-smoke.yml"
            ? `Clarissimi live provider smoke · ${evidenceId}`
            : workflow === "clarissimi.yml"
              ? `Clarissimi external consumer · ${externalRef} · ${evidenceId}`
              : workflow === "clarissimi-full-write-smoke.yml"
                ? `Clarissimi full write smoke · ${externalRef} · ${evidenceId} · ${id}`
                : workflow === "clarissimi-orphan-audit.yml"
                  ? `Clarissimi smoke orphan audit · ${evidenceId}`
                  : "CI";
        const run = {
          databaseId: id,
          displayTitle,
          status: isCi ? "completed" : "queued",
          conclusion: isCi ? "success" : "",
          headSha: sha,
          url: `https://example.test/${id}`,
          createdAt: new Date(now).toISOString(),
        };
        const decoy = {
          ...run,
          databaseId: 900,
          displayTitle: `${displayTitle}-another-maintainer`,
        };
        return ok(JSON.stringify(options.includeConcurrentDecoy && !isCi ? [decoy, run] : [run]));
      }
      if (command === "gh" && args[0] === "run" && args[1] === "watch") {
        const id = Number(args[2]);
        watched.push(id);
        return options.failWatchId === id ? { exitCode: 1, stdout: "", stderr: "failed" } : ok();
      }
      if (command === "pnpm") return ok();
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
}

function ok(stdout = "") {
  return { exitCode: 0, stdout, stderr: "" };
}
