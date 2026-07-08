import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ActionUsageError,
  runActionDryRun,
  runActionFromEnvironment
} from "../dist/index.js";

function githubFixture(overrides = {}) {
  return {
    repository: {
      fullName: "sample/project"
    },
    pullRequest: {
      number: 42,
      title: "Add parser regression coverage",
      body: "Adds a failing parser case and keeps it covered.",
      htmlUrl: "https://github.com/sample/project/pull/42",
      mergedAt: "2026-07-08T00:00:00.000Z",
      user: {
        id: 123456,
        login: "octocat",
        htmlUrl: "https://github.com/octocat"
      },
      labels: [
        {
          name: "tests"
        }
      ],
      changedFiles: [
        {
          filename: "tests/parser.spec.ts",
          status: "added",
          additions: 32,
          deletions: 0,
          patchExcerpt: "test(\"parses nested input\", () => {})"
        }
      ],
      mergeCommitSha: "abc123def4567890",
      ...overrides
    }
  };
}

function pullRequestEvent(overrides = {}) {
  return {
    repository: {
      full_name: "sample/project"
    },
    pull_request: {
      number: 42,
      title: "Add parser regression coverage",
      body: "Adds a failing parser case and keeps it covered.",
      html_url: "https://github.com/sample/project/pull/42",
      merged_at: "2026-07-08T00:00:00.000Z",
      merge_commit_sha: "abc123def4567890",
      user: {
        id: 123456,
        login: "octocat",
        html_url: "https://github.com/octocat"
      },
      labels: [
        {
          name: "tests"
        }
      ],
      ...overrides
    }
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-action-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test("creates a dry-run summary from a GitHub fixture path", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");

    const summary = await runActionDryRun({
      githubFixturePath: fixturePath
    });

    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.inputSource, "github_fixture");
    assert.equal(summary.draftCount, 1);
    assert.equal(summary.proposedEntryCount, 0);
    assert.equal(summary.publicOutputsRendered, false);
    assert.equal(summary.assessment.contributor.login, "octocat");
    assert.equal(JSON.stringify(summary).includes("Adds a failing parser case"), false);
    assert.equal(JSON.stringify(summary).includes("parses nested input"), false);
  });
});

test("maps a merged pull request event from GITHUB_EVENT_PATH", async () => {
  await withTempDir(async (dir) => {
    const eventPath = join(dir, "event.json");
    await writeFile(eventPath, JSON.stringify(pullRequestEvent()), "utf8");

    const summary = await runActionDryRun({
      eventPath
    });

    assert.equal(summary.inputSource, "github_event_path");
    assert.equal(summary.draftCount, 1);
    assert.equal(summary.assessment.source.repository, "sample/project");
    assert.equal(summary.assessment.source.pullRequestNumber, 42);
  });
});

test("maps the repository merged pull request event fixture", async () => {
  const eventPath = join(process.cwd(), "fixtures", "github-pull-request-merged-event.json");
  const eventText = await readFile(eventPath, "utf8");
  const summary = await runActionDryRun({
    eventPath
  });

  assert.equal(summary.inputSource, "github_event_path");
  assert.equal(summary.draftCount, 1);
  assert.equal(summary.assessment.source.repository, "sample/project");
  assert.equal(JSON.stringify(summary).includes(JSON.parse(eventText).pull_request.body), false);
});

test("environment runner accepts GITHUB_EVENT_PATH", async () => {
  const eventPath = join(process.cwd(), "fixtures", "github-pull-request-merged-event.json");
  let stdout = "";
  let stderr = "";

  const exitCode = await runActionFromEnvironment(
    {
      GITHUB_EVENT_PATH: eventPath
    },
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      }
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).inputSource, "github_event_path");
});

test("environment runner ignores blank optional inputs and writes GitHub outputs", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    const outputPath = join(dir, "github-output.txt");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_OUTPUT: outputPath,
        INPUT_EVENT_PATH: "",
        INPUT_GITHUB_FIXTURE: fixturePath,
        INPUT_MODE: ""
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );
    const outputText = await readFile(outputPath, "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).draftCount, 1);
    assert.equal(outputText.includes("draft-count=1"), true);
    assert.equal(outputText.includes("input-source=github_fixture"), true);
  });
});

test("environment runner writes a bounded GitHub step summary", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    const summaryPath = join(dir, "step-summary.md");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_STEP_SUMMARY: summaryPath,
        INPUT_GITHUB_FIXTURE: fixturePath
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );
    const summaryText = await readFile(summaryPath, "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).draftCount, 1);
    assert.equal(summaryText.includes("## Clarissimi dry-run summary"), true);
    assert.equal(summaryText.includes("| Drafts | 1 |"), true);
    assert.equal(summaryText.includes("| Input source | github_fixture |"), true);
    assert.equal(summaryText.includes("Adds a failing parser case"), false);
    assert.equal(summaryText.includes("parses nested input"), false);
  });
});

test("environment runner prefers explicit fixture over implicit GitHub event path", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    const eventPath = join(dir, "event.json");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    await writeFile(eventPath, JSON.stringify(pullRequestEvent()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_EVENT_PATH: eventPath,
        INPUT_GITHUB_FIXTURE: fixturePath
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).inputSource, "github_fixture");
  });
});

test("environment runner returns usage failure for missing input source", async () => {
  let stdout = "";
  let stderr = "";

  const exitCode = await runActionFromEnvironment(
    {},
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      }
    }
  );

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(
    stderr,
    "The action skeleton requires GITHUB_EVENT_PATH or INPUT_GITHUB_FIXTURE.\n"
  );
});

test("environment runner returns usage failure for unsupported mode", async () => {
  let stdout = "";
  let stderr = "";

  const exitCode = await runActionFromEnvironment(
    {
      INPUT_GITHUB_FIXTURE: "unused.json",
      INPUT_MODE: "propose"
    },
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      }
    }
  );

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(stderr, "The action skeleton currently supports only dry-run mode.\n");
});

test("environment runner does not write outputs or summaries for propose mode", async () => {
  await withTempDir(async (dir) => {
    const outputPath = join(dir, "github-output.txt");
    const summaryPath = join(dir, "step-summary.md");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        INPUT_GITHUB_FIXTURE: "unused.json",
        INPUT_MODE: "propose"
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    assert.equal(exitCode, 1);
    assert.equal(stdout, "");
    assert.equal(stderr, "The action skeleton currently supports only dry-run mode.\n");
    await assert.rejects(() => readFile(outputPath, "utf8"));
    await assert.rejects(() => readFile(summaryPath, "utf8"));
  });
});

test("environment runner returns usage failure for explicit source conflict", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    const eventPath = join(dir, "event.json");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    await writeFile(eventPath, JSON.stringify(pullRequestEvent()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        INPUT_EVENT_PATH: eventPath,
        INPUT_GITHUB_FIXTURE: fixturePath
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    assert.equal(exitCode, 1);
    assert.equal(stdout, "");
    assert.equal(stderr, "Use only one action input source: eventPath or githubFixturePath.\n");
  });
});

test("environment runner returns unexpected failure for malformed event JSON", async () => {
  await withTempDir(async (dir) => {
    const eventPath = join(dir, "event.json");
    await writeFile(eventPath, "{", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_EVENT_PATH: eventPath
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    assert.equal(exitCode, 4);
    assert.equal(stdout, "");
    assert.equal(stderr.includes("JSON"), true);
  });
});

test("skips an unmerged pull request event without drafting", async () => {
  await withTempDir(async (dir) => {
    const eventPath = join(dir, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify(pullRequestEvent({ merged_at: null })),
      "utf8"
    );

    const summary = await runActionDryRun({
      eventPath
    });

    assert.equal(summary.draftCount, 0);
    assert.equal(summary.skippedEntryCount, 1);
    assert.equal(summary.approvalStatus, null);
  });
});

test("environment runner treats unmerged pull request events as skipped success", async () => {
  await withTempDir(async (dir) => {
    const eventPath = join(dir, "event.json");
    const summaryPath = join(dir, "step-summary.md");
    await writeFile(
      eventPath,
      JSON.stringify(pullRequestEvent({ merged_at: null })),
      "utf8"
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_STEP_SUMMARY: summaryPath
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );
    const parsed = JSON.parse(stdout);
    const summaryText = await readFile(summaryPath, "utf8");

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(parsed.draftCount, 0);
    assert.equal(parsed.skippedEntryCount, 1);
    assert.equal(parsed.skippedReason, "GitHub pull request event is not a merged pull request.");
    assert.equal(
      summaryText.includes(
        "| Skipped reason | GitHub pull request event is not a merged pull request. |"
      ),
      true
    );
  });
});

test("rejects non-dry-run modes in the action skeleton", async () => {
  await assert.rejects(
    () =>
      runActionDryRun({
        mode: "propose",
        githubFixturePath: "unused.json"
      }),
    ActionUsageError
  );
});

test("environment runner writes JSON summary and returns success", async () => {
  await withTempDir(async (dir) => {
    const fixturePath = join(dir, "github-fixture.json");
    await writeFile(fixturePath, JSON.stringify(githubFixture()), "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runActionFromEnvironment(
      {
        INPUT_GITHUB_FIXTURE: fixturePath
      },
      {
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        }
      }
    );

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).draftCount, 1);
  });
});
