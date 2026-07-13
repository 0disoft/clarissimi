import assert from "node:assert/strict";
import test from "node:test";

import { runReleaseCandidateEvidenceIssue } from "../release-candidate-evidence-issue.mjs";

const exampleSha = "0123456789abcdef0123456789abcdef01234567";
const evidenceId = "0123456789abcdef0123456789abcdef";

test("release candidate evidence issue prints a validated evidence body", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({
        databaseId: 12345,
        workflowName: "CI",
        url: "https://github.com/owner/repo/actions/runs/12345",
      }),
      67890: createRun({
        databaseId: 67890,
        workflowName: "Clarissimi live provider smoke",
        url: "https://github.com/owner/repo/actions/runs/67890",
        event: "workflow_dispatch",
      }),
      24680: createExternalRun("v0.1.0"),
      13579: createExternalWriteRun("v0.1.0"),
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--",
      "--repo",
      "owner/repo",
      "--branch",
      "main",
      "--sha",
      exampleSha,
      "--release-type",
      "versioned-action-tag",
      "--release-version",
      "v0.1.0",
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "minimax-m3",
      "--provider-endpoint",
      "https://gateway.example/v1/chat/completions",
      "--provider-thinking",
      "disabled",
      "--print",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(
    harness.commands.map((command) => [command.command, ...command.args.slice(0, 2)]),
    [
      ["gh", "--version"],
      ["gh", "run", "view"],
      ["gh", "run", "view"],
      ["gh", "run", "view"],
      ["gh", "run", "view"],
    ],
  );
  assert.equal(
    harness.logs
      .join("\n")
      .includes("Release candidate evidence for `0123456789abcdef0123456789abcdef01234567`"),
    true,
  );
  assert.equal(
    harness.logs.join("\n").includes("https://github.com/owner/repo/actions/runs/12345"),
    true,
  );
  assert.equal(
    harness.logs
      .join("\n")
      .includes("Repository secret used by workflow: `CLARISSIMI_PROVIDER_TOKEN`"),
    true,
  );
  assert.equal(
    harness.logs
      .join("\n")
      .includes("https://github.com/0disoft/integration-lab/actions/runs/24680"),
    true,
  );
  assert.equal(
    harness.logs
      .join("\n")
      .includes("https://github.com/0disoft/integration-lab/actions/runs/13579"),
    true,
  );
  assert.equal(harness.logs.join("\n").includes("Clarissimi ref: `v0.1.0`"), true);
  assert.equal(harness.logs.join("\n").includes("minimax-m3"), true);
  assert.equal(
    harness.logs.join("\n").includes("--endpoint https://gateway.example/v1/chat/completions"),
    true,
  );
  assert.equal(
    harness.logs
      .join("\n")
      .includes("Provider endpoint override: `https://gateway.example/v1/chat/completions`"),
    true,
  );
  assert.equal(harness.logs.join("\n").includes("Provider thinking mode: `disabled`"), true);
  assert.equal(
    harness.logs.join("\n").includes("versioned Action tag `v0.1.0` under ADR 0031"),
    true,
  );
  assert.equal(harness.logs.join("\n").includes("publishing immutable tag `v0.1.0`"), true);
  assert.equal(
    harness.logs.join("\n").includes("public package publication remains blocked"),
    true,
  );
  assert.equal(harness.logs.join("\n").includes("provider-token-value"), false);
});

test("versioned evidence accepts the pre-tag candidate SHA as the external ref", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({ databaseId: 12345, workflowName: "CI" }),
      67890: createRun({
        databaseId: 67890,
        workflowName: "Clarissimi live provider smoke",
        event: "workflow_dispatch",
      }),
      24680: createExternalRun(exampleSha),
      13579: createExternalWriteRun(exampleSha),
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--release-type",
      "versioned-action-tag",
      "--release-version",
      "v0.2.0",
      "--external-ref",
      exampleSha,
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
      "--print",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 0);
  assert.equal(harness.logs.join("\n").includes(`Clarissimi ref: \`${exampleSha}\``), true);
  assert.equal(
    harness.logs.join("\n").includes("versioned Action tag `v0.2.0` under ADR 0044"),
    true,
  );
});

test("major alias evidence records v0 with the exact expected SHA", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({ databaseId: 12345, workflowName: "CI" }),
      67890: createRun({
        databaseId: 67890,
        workflowName: "Clarissimi live provider smoke",
        event: "workflow_dispatch",
        headBranch: "v0.2.0",
      }),
      24680: createExternalRun("v0"),
      13579: createExternalWriteRun("v0"),
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--release-type",
      "major-alias",
      "--release-version",
      "v0.2.0",
      "--external-ref",
      "v0",
      "--live-ref",
      "v0.2.0",
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
      "--print",
    ],
    harness.runtime,
  );

  const body = harness.logs.join("\n");
  assert.equal(exitCode, 0);
  assert.match(body, /moving Action alias `v0` to `v0\.2\.0` under ADR 0034/);
  assert.match(body, new RegExp(`--clarissimi-ref v0 --expected-sha ${exampleSha}`));
  assert.match(body, new RegExp(`-f clarissimi-ref=v0 -f expected-sha=${exampleSha}`));
  assert.match(body, /supports keeping moving alias `v0`/);
});

test("release candidate evidence issue resolves HEAD and creates an issue with body on stdin", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    issueUrl: "https://github.com/0disoft/clarissimi/issues/12",
    runs: {
      12345: createRun({
        databaseId: 12345,
        workflowName: "CI",
        url: "https://github.com/0disoft/clarissimi/actions/runs/12345",
      }),
      67890: createRun({
        databaseId: 67890,
        workflowName: "Clarissimi live provider smoke",
        url: "https://github.com/0disoft/clarissimi/actions/runs/67890",
      }),
      24680: createExternalRun(exampleSha),
      13579: createExternalWriteRun(exampleSha),
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
      "--title",
      "Release candidate evidence for 0123456",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(
    harness.commands.map((command) => [command.command, ...command.args.slice(0, 2)]),
    [
      ["git", "rev-parse", "HEAD"],
      ["gh", "--version"],
      ["gh", "run", "view"],
      ["gh", "run", "view"],
      ["gh", "run", "view"],
      ["gh", "run", "view"],
      ["gh", "issue", "create"],
    ],
  );

  const issueCreate = harness.commands.find(
    (command) =>
      command.command === "gh" && command.args[0] === "issue" && command.args[1] === "create",
  );
  assert.deepEqual(issueCreate.args, [
    "issue",
    "create",
    "--repo",
    "0disoft/clarissimi",
    "--title",
    "Release candidate evidence for 0123456",
    "--body-file",
    "-",
  ]);
  assert.equal(issueCreate.options.input.includes("Run id: `12345`"), true);
  assert.equal(issueCreate.options.input.includes("Run id: `67890`"), true);
  assert.equal(issueCreate.options.input.includes("Run id: `24680`"), true);
  assert.equal(issueCreate.options.input.includes("Run id: `13579`"), true);
  assert.equal(
    harness.logs.includes(
      "release candidate evidence issue created: https://github.com/0disoft/clarissimi/issues/12",
    ),
    true,
  );
});

test("release candidate evidence issue validates correlated workflow titles", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({ databaseId: 12345, workflowName: "CI" }),
      67890: createRun({
        databaseId: 67890,
        displayTitle: `Clarissimi live provider smoke · ${evidenceId}`,
        event: "workflow_dispatch",
        workflowName: "Clarissimi live provider smoke",
      }),
      24680: createExternalRun(exampleSha, {
        displayTitle: `Clarissimi external consumer · ${exampleSha} · ${evidenceId}`,
      }),
      13579: createExternalWriteRun(exampleSha, {
        displayTitle: `Clarissimi full write smoke · ${exampleSha} · ${evidenceId} · 13579`,
      }),
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
      "--evidence-id",
      evidenceId,
      "--print",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 0);
  assert.equal(
    harness.logs.join("\n").includes(`Evidence correlation id: \`${evidenceId}\``),
    true,
  );
  assert.match(harness.logs.join("\n"), new RegExp(`evidence-id=${evidenceId}`));
});

test("release candidate evidence issue rejects invalid inputs before calling git or gh", async () => {
  const invalidEvidenceId = createHarness({ headSha: exampleSha });
  assert.equal(
    await runReleaseCandidateEvidenceIssue(
      [
        "--ci-run",
        "12345",
        "--live-run",
        "67890",
        "--external-run",
        "24680",
        "--external-write-run",
        "13579",
        "--provider-model",
        "gpt-4.1-mini",
        "--evidence-id",
        "abcdef",
      ],
      invalidEvidenceId.runtime,
    ),
    2,
  );
  assert.equal(
    invalidEvidenceId.errors.includes("--evidence-id must be 32 lowercase hexadecimal characters."),
    true,
  );
  assert.equal(invalidEvidenceId.commands.length, 0);

  const invalidRepo = createHarness({ headSha: exampleSha });
  const invalidRepoExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--repo",
      "owner-only",
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    invalidRepo.runtime,
  );

  assert.equal(invalidRepoExitCode, 2);
  assert.equal(invalidRepo.errors.includes("--repo must use owner/name format."), true);
  assert.equal(invalidRepo.commands.length, 0);

  const invalidRun = createHarness({ headSha: exampleSha });
  const invalidRunExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "0",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    invalidRun.runtime,
  );

  assert.equal(invalidRunExitCode, 2);
  assert.equal(
    invalidRun.errors.includes("--ci-run requires a positive numeric workflow run id."),
    true,
  );
  assert.equal(invalidRun.commands.length, 0);

  const missingExternalRun = createHarness({ headSha: exampleSha });
  const missingExternalRunExitCode = await runReleaseCandidateEvidenceIssue(
    ["--ci-run", "12345", "--live-run", "67890", "--provider-model", "gpt-4.1-mini"],
    missingExternalRun.runtime,
  );

  assert.equal(missingExternalRunExitCode, 2);
  assert.equal(
    missingExternalRun.errors.includes(
      "--external-run requires a positive numeric workflow run id.",
    ),
    true,
  );
  assert.equal(missingExternalRun.commands.length, 0);

  const missingExternalWriteRun = createHarness({ headSha: exampleSha });
  const missingExternalWriteRunExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    missingExternalWriteRun.runtime,
  );

  assert.equal(missingExternalWriteRunExitCode, 2);
  assert.equal(
    missingExternalWriteRun.errors.includes(
      "--external-write-run requires a positive numeric workflow run id.",
    ),
    true,
  );
  assert.equal(missingExternalWriteRun.commands.length, 0);

  const emptyModel = createHarness({ headSha: exampleSha });
  const emptyModelExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "",
    ],
    emptyModel.runtime,
  );

  assert.equal(emptyModelExitCode, 2);
  assert.equal(emptyModel.errors.includes("--provider-model requires a non-empty value."), true);
  assert.equal(emptyModel.commands.length, 0);

  const invalidEndpoint = createHarness({ headSha: exampleSha });
  const invalidEndpointExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "minimax-m3",
      "--provider-endpoint",
      "http://gateway.example/v1/chat/completions",
    ],
    invalidEndpoint.runtime,
  );

  assert.equal(invalidEndpointExitCode, 2);
  assert.equal(invalidEndpoint.errors.includes("--provider-endpoint must be an https URL."), true);
  assert.equal(invalidEndpoint.commands.length, 0);

  const unsupportedThinking = createHarness({ headSha: exampleSha });
  const unsupportedThinkingExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--provider-model",
      "minimax-m3",
      "--provider-thinking",
      "enabled",
    ],
    unsupportedThinking.runtime,
  );

  assert.equal(unsupportedThinkingExitCode, 2);
  assert.equal(
    unsupportedThinking.errors.includes("--provider-thinking supports only disabled."),
    true,
  );
  assert.equal(unsupportedThinking.commands.length, 0);

  const unsupportedReleaseType = createHarness({ headSha: exampleSha });
  const unsupportedReleaseTypeExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--provider-model",
      "gpt-4.1-mini",
      "--release-type",
      "package-publication",
    ],
    unsupportedReleaseType.runtime,
  );

  assert.equal(unsupportedReleaseTypeExitCode, 2);
  assert.equal(
    unsupportedReleaseType.errors.includes(
      "--release-type supports source-only, versioned-action-tag, or major-alias.",
    ),
    true,
  );
  assert.equal(unsupportedReleaseType.commands.length, 0);

  const invalidReleaseVersion = createHarness({ headSha: exampleSha });
  const invalidReleaseVersionExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--provider-model",
      "gpt-4.1-mini",
      "--release-type",
      "versioned-action-tag",
      "--release-version",
      "v1.0.0",
    ],
    invalidReleaseVersion.runtime,
  );

  assert.equal(invalidReleaseVersionExitCode, 2);
  assert.equal(
    invalidReleaseVersion.errors.includes(
      "--release-version requires a v0.x.y tag authorized by ADR 0044.",
    ),
    true,
  );
  assert.equal(invalidReleaseVersion.commands.length, 0);
});

test("release candidate evidence issue rejects workflow run mismatch before issue creation", async () => {
  const wrongSha = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({
        databaseId: 12345,
        headSha: "ffffffffffffffffffffffffffffffffffffffff",
        workflowName: "CI",
        url: "https://github.com/0disoft/clarissimi/actions/runs/12345",
      }),
    },
  });

  const wrongShaExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    wrongSha.runtime,
  );

  assert.equal(wrongShaExitCode, 1);
  assert.equal(
    wrongSha.errors.includes(
      "hosted CI run 12345 validates ffffffffffffffffffffffffffffffffffffffff, not 0123456789abcdef0123456789abcdef01234567.",
    ),
    true,
  );
  assert.equal(
    wrongSha.commands.some((command) => command.command === "gh" && command.args[0] === "issue"),
    false,
  );

  const failedRun = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({
        databaseId: 12345,
        workflowName: "CI",
        url: "https://github.com/0disoft/clarissimi/actions/runs/12345",
        conclusion: "failure",
      }),
    },
  });

  const failedRunExitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    failedRun.runtime,
  );

  assert.equal(failedRunExitCode, 1);
  assert.equal(
    failedRun.errors.includes(
      "hosted CI run 12345 must be completed successfully; status=completed conclusion=failure.",
    ),
    true,
  );
});

test("release candidate evidence issue rejects an external run for another Clarissimi ref", async () => {
  const harness = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({
        databaseId: 12345,
        workflowName: "CI",
        url: "https://github.com/0disoft/clarissimi/actions/runs/12345",
      }),
      67890: createRun({
        databaseId: 67890,
        workflowName: "Clarissimi live provider smoke",
        url: "https://github.com/0disoft/clarissimi/actions/runs/67890",
      }),
      24680: createExternalRun("v0.1.0"),
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 1);
  assert.equal(
    harness.errors.includes(
      `external consumer smoke run 24680 must validate Clarissimi ${exampleSha}; ` +
        "displayTitle=Clarissimi external consumer · v0.1.0.",
    ),
    true,
  );
  assert.equal(
    harness.commands.some((command) => command.command === "gh" && command.args[0] === "issue"),
    false,
  );
});

test("release candidate evidence issue rejects full-write evidence without successful cleanup", async () => {
  const fullWriteRun = createExternalWriteRun(exampleSha);
  const windowsJob = fullWriteRun.jobs.find((job) => job.name.includes("windows-latest"));
  const cleanupStep = windowsJob.steps.find(
    (step) => step.name === "Clean up smoke pull requests and branches",
  );
  cleanupStep.conclusion = "failure";

  const harness = createHarness({
    headSha: exampleSha,
    runs: {
      12345: createRun({
        databaseId: 12345,
        workflowName: "CI",
        url: "https://github.com/0disoft/clarissimi/actions/runs/12345",
      }),
      67890: createRun({
        databaseId: 67890,
        workflowName: "Clarissimi live provider smoke",
        url: "https://github.com/0disoft/clarissimi/actions/runs/67890",
      }),
      24680: createExternalRun(exampleSha),
      13579: fullWriteRun,
    },
  });

  const exitCode = await runReleaseCandidateEvidenceIssue(
    [
      "--sha",
      exampleSha,
      "--ci-run",
      "12345",
      "--live-run",
      "67890",
      "--external-run",
      "24680",
      "--external-write-run",
      "13579",
      "--provider-model",
      "gpt-4.1-mini",
    ],
    harness.runtime,
  );

  assert.equal(exitCode, 1);
  assert.equal(
    harness.errors.includes(
      "external full-write smoke run 13579 job Stage, approve, and promote (windows-latest) " +
        "step Clean up smoke pull requests and branches must succeed.",
    ),
    true,
  );
});

function createRun(overrides = {}) {
  return {
    databaseId: 12345,
    createdAt: "2026-07-09T00:00:10Z",
    headSha: exampleSha,
    headBranch: "main",
    url: "https://github.com/0disoft/clarissimi/actions/runs/12345",
    status: "completed",
    conclusion: "success",
    workflowName: "CI",
    event: "push",
    ...overrides,
  };
}

function createExternalRun(ref, overrides = {}) {
  return createRun({
    databaseId: 24680,
    displayTitle: `Clarissimi external consumer · ${ref}`,
    event: "workflow_dispatch",
    headBranch: "main",
    headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    url: "https://github.com/0disoft/integration-lab/actions/runs/24680",
    workflowName: "Clarissimi external consumer",
    ...overrides,
  });
}

function createExternalWriteRun(ref, overrides = {}) {
  const runId = 13579;
  return createRun({
    databaseId: runId,
    displayTitle: `Clarissimi full write smoke · ${ref} · ${runId}`,
    event: "workflow_dispatch",
    headBranch: "main",
    headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    jobs: ["ubuntu-latest", "macos-latest", "windows-latest"].map((runner) => ({
      conclusion: "success",
      name: `Stage, approve, and promote (${runner})`,
      status: "completed",
      steps: [
        "Stage synthetic draft",
        "Approve and merge the draft proposal",
        "Promote approved draft",
        "Verify recognition proposal",
        "Clean up smoke pull requests and branches",
      ].map((name) => ({
        conclusion: "success",
        name,
        status: "completed",
      })),
    })),
    url: `https://github.com/0disoft/integration-lab/actions/runs/${runId}`,
    workflowName: "Clarissimi full write smoke",
    ...overrides,
  });
}

function createHarness(options) {
  const commands = [];
  const logs = [];
  const errors = [];

  return {
    commands,
    logs,
    errors,
    runtime: {
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

        if (matches(args, ["run", "view"])) {
          const run = options.runs?.[args[2]];
          return run === undefined
            ? failure(`missing run ${args[2]}`)
            : success(`${JSON.stringify(run)}\n`);
        }

        if (matches(args, ["issue", "create"])) {
          return success(
            `${options.issueUrl ?? "https://github.com/0disoft/clarissimi/issues/1"}\n`,
          );
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
