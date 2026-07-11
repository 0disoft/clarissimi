import assert from "node:assert/strict";
import test from "node:test";
import { runReleaseEvidenceCleanup } from "../release-evidence-cleanup.mjs";

const runId = "29137139977";
const sourceId = "800291371399771";
const base = `clarissimi/smoke/${runId}/ubuntu/base`;
const draft = `clarissimi/drafts/merged_pull_request-${sourceId}`;
const recognition = `clarissimi/recognition/merged_pull_request-${sourceId}`;

test("previews only residue deterministically owned by the completed full-write run", async () => {
  const harness = createHarness({
    pullRequests: [pr(41, draft, base), pr(42, "feature/user-work", "main")],
    branches: [base, draft, recognition, "clarissimi/recognition/merged_pull_request-123"],
  });
  assert.equal(await runReleaseEvidenceCleanup(["--run-id", runId], harness.runtime), 0);
  const receipt = JSON.parse(harness.logs.at(-1));
  assert.equal(receipt.mode, "preview");
  assert.deepEqual(
    receipt.matched.pullRequests.map((item) => item.number),
    [41],
  );
  assert.deepEqual(receipt.matched.branches, [draft, recognition, base].sort());
  assert.equal(
    harness.commands.some((item) => isMutation(item.args)),
    false,
  );
});

test("apply closes matched pull requests before deleting exact branches and verifies empty state", async () => {
  const harness = createHarness({
    pullRequests: [pr(41, draft, base)],
    branches: [base, draft],
    stateAfterMutation: { pullRequests: [], branches: [] },
  });
  assert.equal(await runReleaseEvidenceCleanup(["--run-id", runId, "--apply"], harness.runtime), 0);
  const mutations = harness.commands.filter((item) => isMutation(item.args));
  assert.deepEqual(
    mutations.map((item) => item.args.slice(0, 3)),
    [
      ["pr", "close", "41"],
      ["api", "--method", "DELETE"],
      ["api", "--method", "DELETE"],
    ],
  );
  const receipt = JSON.parse(harness.logs.at(-1));
  assert.equal(receipt.mode, "applied");
  assert.deepEqual(receipt.remaining, { pullRequests: [], branches: [] });
});

test("rejects unrelated or active workflow runs before reading repository state", async () => {
  for (const run of [
    fullWriteRun({ workflowName: "Another workflow" }),
    fullWriteRun({ status: "in_progress" }),
  ]) {
    const harness = createHarness({ run });
    assert.equal(
      await runReleaseEvidenceCleanup(["--run-id", runId, "--apply"], harness.runtime),
      1,
    );
    assert.equal(
      harness.commands.some((item) => item.args[0] === "pr"),
      false,
    );
  }
});

test("continues bounded cleanup after one mutation fails and reports incomplete final state", async () => {
  const harness = createHarness({
    pullRequests: [pr(41, draft, base)],
    branches: [base, draft],
    failBranch: draft,
    stateAfterMutation: { pullRequests: [], branches: [draft] },
  });
  assert.equal(await runReleaseEvidenceCleanup(["--run-id", runId, "--apply"], harness.runtime), 1);
  const mutations = harness.commands.filter((item) => isMutation(item.args));
  assert.equal(mutations.length, 3);
  const receipt = JSON.parse(harness.logs.at(-1));
  assert.equal(receipt.failures.length, 1);
  assert.deepEqual(receipt.remaining.branches, [draft]);
});

function createHarness(options = {}) {
  const commands = [];
  const logs = [];
  const errors = [];
  let stateReads = 0;
  return {
    commands,
    logs,
    errors,
    runtime: {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
      runCommand: async (command, args) => {
        commands.push({ command, args });
        if (command !== "gh") return failure("unexpected executable");
        if (args[0] === "--version") return success("gh fake");
        if (args[0] === "run") return success(JSON.stringify(options.run ?? fullWriteRun()));
        if (args[0] === "pr" && args[1] === "list") {
          const state = stateReads === 0 ? options : (options.stateAfterMutation ?? options);
          return success(JSON.stringify(state.pullRequests ?? []));
        }
        if (args[0] === "api" && args[1]?.startsWith("repos/")) {
          const state = stateReads === 0 ? options : (options.stateAfterMutation ?? options);
          stateReads += 1;
          return success(
            JSON.stringify(
              (state.branches ?? []).map((branch) => ({
                ref: `refs/heads/${branch}`,
              })),
            ),
          );
        }
        if (args[0] === "pr" && args[1] === "close") return success("");
        if (args[0] === "api" && args[1] === "--method") {
          const branch = args[3].split("/git/refs/heads/")[1];
          return branch === options.failBranch ? failure("protected branch") : success("");
        }
        return failure(`unexpected gh args: ${args.join(" ")}`);
      },
    },
  };
}

function fullWriteRun(overrides = {}) {
  return {
    databaseId: Number(runId),
    displayTitle: `Clarissimi full write smoke · candidate · ${runId}`,
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "failure",
    workflowName: "Clarissimi full write smoke",
    url: `https://github.com/0disoft/integration-lab/actions/runs/${runId}`,
    ...overrides,
  };
}

function pr(number, headRefName, baseRefName) {
  return {
    number,
    headRefName,
    baseRefName,
    url: `https://github.com/0disoft/integration-lab/pull/${number}`,
  };
}
function isMutation(args) {
  return (args[0] === "pr" && args[1] === "close") || (args[0] === "api" && args[1] === "--method");
}
function success(stdout) {
  return { exitCode: 0, stdout, stderr: "" };
}
function failure(stderr) {
  return { exitCode: 1, stdout: "", stderr };
}
