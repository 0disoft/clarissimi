import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  DirectCommitError,
  createDirectCommit,
  publishDirectCommit,
  stageProposalRecognitionOutputs,
} from "../dist/index.js";

const source = {
  repository: "sample/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z",
};

function assessment() {
  return {
    schemaVersion: "clarissimi.assessment/v1",
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat",
    },
    contributionType: "test",
    affectedArea: "parser regression coverage",
    impactLevel: "medium",
    evidenceSummary: "Added a regression test for a parser crash.",
    evidenceRefs: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/sample/project/pull/42",
        title: "Add parser regression coverage",
      },
    ],
    suggestedBadge: "Regression Shield",
    publicRecognitionText: "Added regression coverage for the parser crash.",
    confidence: 0.82,
    maintainerApprovalStatus: "approved",
    source,
  };
}

async function withRepository(callback, objectFormat = "sha1") {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-direct-commit-"));
  const repositoryDir = join(dir, "repo");
  const remoteDir = join(dir, "remote.git");
  const stagedOutputDir = join(dir, "staged");
  try {
    await git(dir, ["init", "--bare", `--object-format=${objectFormat}`, remoteDir]);
    await mkdir(repositoryDir);
    await git(repositoryDir, ["init", "-b", "main", `--object-format=${objectFormat}`]);
    await git(repositoryDir, ["config", "user.name", "Clarissimi Tests"]);
    await git(repositoryDir, ["config", "user.email", "clarissimi-tests.invalid"]);
    await writeFile(join(repositoryDir, "README.md"), "# Fixture Repository\n", "utf8");
    await git(repositoryDir, ["add", "README.md"]);
    await git(repositoryDir, ["commit", "-m", "Initial commit"]);
    await git(repositoryDir, ["remote", "add", "origin", remoteDir]);
    await git(repositoryDir, ["push", "-u", "origin", "main"]);
    return await callback({ repositoryDir, remoteDir, stagedOutputDir });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function stageRecognition(stagedOutputDir) {
  return stageProposalRecognitionOutputs({
    outputDir: stagedOutputDir,
    assessments: [assessment()],
    redactionMatchCount: 0,
  });
}

test("creates and publishes an explicit direct commit to the target branch", async () => {
  await withRepository(async ({ repositoryDir, remoteDir, stagedOutputDir }) => {
    const baseCommitSha = await git(repositoryDir, ["rev-parse", "HEAD"]);
    const staging = await stageRecognition(stagedOutputDir);
    const commit = await createDirectCommit({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      targetBranch: "main",
      expectedHeadSha: baseCommitSha,
    });

    assert.equal(commit.baseCommitSha, baseCommitSha);
    assert.equal(commit.commitCreated, true);
    assert.notEqual(commit.commitSha, baseCommitSha);
    assert.deepEqual(
      [...commit.changedFiles].sort(),
      staging.manifest.files.map((file) => file.path).sort(),
    );

    const published = await publishDirectCommit({ repositoryDir, commit });
    assert.equal(published.pushed, true);
    assert.equal(await git(remoteDir, ["rev-parse", "refs/heads/main"]), commit.commitSha);
    assert.match(await readFile(join(repositoryDir, "CONTRIBUTORS.md"), "utf8"), /octocat/);
  });
});

test("verifies and publishes exact output in SHA-256 Git repositories", async () => {
  await withRepository(async ({ repositoryDir, remoteDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    const commit = await createDirectCommit({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      targetBranch: "main",
    });
    assert.equal(commit.commitSha.length, 64);
    await publishDirectCommit({ repositoryDir, commit });
    assert.equal(await git(remoteDir, ["rev-parse", "refs/heads/main"]), commit.commitSha);
  }, "sha256");
});

test("rejects a dirty worktree before writing recognition outputs", async () => {
  await withRepository(async ({ repositoryDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    await writeFile(join(repositoryDir, "notes.txt"), "local work\n", "utf8");

    await assert.rejects(
      () =>
        createDirectCommit({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          targetBranch: "main",
        }),
      (error) => error instanceof DirectCommitError && error.code === "dirty_worktree",
    );
    assert.equal(await git(repositoryDir, ["status", "--short"]), "?? notes.txt");
  });
});

test("rejects a stale expected HEAD before writing recognition outputs", async () => {
  await withRepository(async ({ repositoryDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);

    await assert.rejects(
      () =>
        createDirectCommit({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          targetBranch: "main",
          expectedHeadSha: "0".repeat(40),
        }),
      (error) => error instanceof DirectCommitError && error.code === "expected_head_mismatch",
    );
    assert.equal(await git(repositoryDir, ["status", "--short"]), "");
  });
});

test("restores the clean checkout when staged output verification fails mid-write", async () => {
  await withRepository(async ({ repositoryDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    const files = staging.manifest.files.map((file, index) =>
      index === 1 ? { ...file, sha256: "0".repeat(64) } : file,
    );

    await assert.rejects(() =>
      createDirectCommit({
        repositoryDir,
        stagedOutputDir,
        manifest: { ...staging.manifest, files },
        targetBranch: "main",
      }),
    );
    assert.equal(await git(repositoryDir, ["status", "--short"]), "");
    await assert.rejects(() => readFile(join(repositoryDir, ".clarissimi", "contributions.jsonl")));
  });
});

test("refuses non-fast-forward publication after the target branch advances", async () => {
  await withRepository(async ({ repositoryDir, remoteDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    const commit = await createDirectCommit({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      targetBranch: "main",
    });

    const competingDir = join(repositoryDir, "..", "competing");
    await git(join(repositoryDir, ".."), ["clone", "--branch", "main", remoteDir, competingDir]);
    await git(competingDir, ["config", "user.name", "Competing Writer"]);
    await git(competingDir, ["config", "user.email", "competing.invalid"]);
    await writeFile(join(competingDir, "COMPETING.md"), "# Concurrent update\n", "utf8");
    await git(competingDir, ["add", "COMPETING.md"]);
    await git(competingDir, ["commit", "-m", "Concurrent update"]);
    await git(competingDir, ["push", "origin", "main"]);

    await assert.rejects(
      () => publishDirectCommit({ repositoryDir, commit }),
      (error) => error instanceof DirectCommitError && error.code === "git_command_failed",
    );
    assert.notEqual(await git(remoteDir, ["rev-parse", "refs/heads/main"]), commit.commitSha);
  });
});

test("failed commits preserve unrelated work and index changes made by a hook", async () => {
  await withRepository(async ({ repositoryDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    const base = await git(repositoryDir, ["rev-parse", "HEAD"]);
    await writeFile(
      join(repositoryDir, ".git", "hooks", "pre-commit"),
      "#!/bin/sh\nprintf 'concurrent tracked work\\n' > README.md\ngit add README.md\nprintf 'unstaged tracked work\\n' >> README.md\nprintf 'concurrent untracked work\\n' > notes.txt\nexit 1\n",
      { mode: 0o755 },
    );
    await assert.rejects(
      () =>
        createDirectCommit({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          targetBranch: "main",
        }),
      (error) => error instanceof DirectCommitError && error.code === "git_command_failed",
    );
    assert.equal(
      await readFile(join(repositoryDir, "README.md"), "utf8"),
      "concurrent tracked work\nunstaged tracked work\n",
    );
    assert.equal(
      await readFile(join(repositoryDir, "notes.txt"), "utf8"),
      "concurrent untracked work\n",
    );
    assert.equal(await git(repositoryDir, ["diff", "--cached", "--name-only"]), "README.md");
    assert.equal(await git(repositoryDir, ["show", ":README.md"]), "concurrent tracked work");
    assert.equal(await git(repositoryDir, ["diff", "--name-only"]), "README.md");
    assert.equal(await git(repositoryDir, ["rev-parse", "HEAD"]), base);
    for (const file of staging.manifest.files) {
      await assert.rejects(() => readFile(join(repositoryDir, file.path)), { code: "ENOENT" });
    }
  });
});

test("failed commits never rewind a HEAD advanced by a hook", async () => {
  await withRepository(async ({ repositoryDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    const base = await git(repositoryDir, ["rev-parse", "HEAD"]);
    await writeFile(
      join(repositoryDir, ".git", "hooks", "pre-commit"),
      "#!/bin/sh\nprintf 'concurrent committed work\\n' > CONCURRENT.md\ngit add CONCURRENT.md\ngit -c core.hooksPath=/dev/null commit -m 'Concurrent commit'\nexit 1\n",
      { mode: 0o755 },
    );
    let failure;
    await assert.rejects(
      () =>
        createDirectCommit({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          targetBranch: "main",
        }),
      (error) => {
        failure = error;
        return error instanceof DirectCommitError;
      },
    );
    assert.notEqual(await git(repositoryDir, ["rev-parse", "HEAD"]), base);
    assert.equal(await git(repositoryDir, ["log", "-1", "--format=%s"]), "Concurrent commit");
    assert.equal(
      await readFile(join(repositoryDir, "CONCURRENT.md"), "utf8"),
      "concurrent committed work\n",
    );
    assert.equal(await git(repositoryDir, ["status", "--short"]), "");
    assert.equal(failure.code, "rollback_failed");
  });
});

test("mid-write rollback restores tracked recognition outputs without moving HEAD", async () => {
  await withRepository(async ({ repositoryDir, stagedOutputDir }) => {
    const staging = await stageRecognition(stagedOutputDir);
    await createDirectCommit({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      targetBranch: "main",
    });
    const base = await git(repositoryDir, ["rev-parse", "HEAD"]);
    const first = staging.manifest.files[0];
    const original = await readFile(join(repositoryDir, first.path), "utf8");
    const modified = original + "\n";
    await writeFile(join(stagedOutputDir, first.path), modified);
    const files = staging.manifest.files.map((file, index) =>
      index === 0
        ? {
            ...file,
            bytes: Buffer.byteLength(modified),
            sha256: createHash("sha256").update(modified).digest("hex"),
          }
        : index === 1
          ? { ...file, sha256: "0".repeat(64) }
          : file,
    );
    await assert.rejects(() =>
      createDirectCommit({
        repositoryDir,
        stagedOutputDir,
        manifest: { ...staging.manifest, files },
        targetBranch: "main",
      }),
    );
    assert.equal(await readFile(join(repositoryDir, first.path), "utf8"), original);
    assert.equal(await git(repositoryDir, ["rev-parse", "HEAD"]), base);
    assert.equal(await git(repositoryDir, ["status", "--short"]), "");
  });
});

for (const [name, hook] of [
  ["tracked edit", "printf 'unexpected tracked change\\n' > README.md\ngit add README.md"],
  ["new file", "printf 'unexpected new file\\n' > SURPRISE.txt\ngit add SURPRISE.txt"],
  ["rename into an owned path", "mv README.md CONTRIBUTORS.md\ngit add --all"],
  [
    "leading-space filename",
    "printf 'unexpected filename\\n' > ' CONTRIBUTORS.md'\ngit add -- ' CONTRIBUTORS.md'",
  ],
]) {
  test(`blocks publishing a hook's unowned ${name}`, async () => {
    await withRepository(async ({ repositoryDir, remoteDir, stagedOutputDir }) => {
      const staging = await stageRecognition(stagedOutputDir);
      const base = await git(remoteDir, ["rev-parse", "refs/heads/main"]);
      await git(repositoryDir, ["config", "diff.renames", "true"]);
      await writeFile(join(repositoryDir, ".git", "hooks", "pre-commit"), `#!/bin/sh\n${hook}\n`, {
        mode: 0o755,
      });
      let failure;
      try {
        const commit = await createDirectCommit({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          targetBranch: "main",
        });
        await publishDirectCommit({ repositoryDir, commit });
      } catch (error) {
        failure = error;
      }
      assert.equal(
        await git(remoteDir, ["rev-parse", "refs/heads/main"]),
        base,
        "Unowned hook changes must never reach the target branch.",
      );
      assert.ok(failure instanceof DirectCommitError);
      assert.equal(failure.code, "unowned_commit_changes");
      assert.notEqual(await git(repositoryDir, ["rev-parse", "HEAD"]), base);
      assert.equal(await git(repositoryDir, ["status", "--short"]), "");
    });
  });
}

for (const [name, command] of [
  [
    "same-size approval rewrite",
    `node -e 'const fs=require("node:fs"),p=".clarissimi/contributions.jsonl";fs.writeFileSync(p,fs.readFileSync(p,"utf8").replaceAll("approved","rejected"))'`,
  ],
  [
    "appended invalid record",
    "printf '\\n{\"unexpected\":true}\\n' >> .clarissimi/contributions.jsonl",
  ],
]) {
  test(`blocks publishing committed output with ${name}`, async () => {
    await withRepository(async ({ repositoryDir, remoteDir, stagedOutputDir }) => {
      const staging = await stageRecognition(stagedOutputDir);
      const base = await git(remoteDir, ["rev-parse", "refs/heads/main"]);
      await writeFile(
        join(repositoryDir, ".git", "hooks", "pre-commit"),
        `#!/bin/sh\n${command}\ngit add -- .clarissimi/contributions.jsonl\n`,
        { mode: 0o755 },
      );
      let failure;
      try {
        const commit = await createDirectCommit({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          targetBranch: "main",
        });
        await publishDirectCommit({ repositoryDir, commit });
      } catch (error) {
        failure = error;
      }
      assert.equal(await git(remoteDir, ["rev-parse", "refs/heads/main"]), base);
      assert.ok(failure instanceof DirectCommitError);
      assert.equal(failure.code, "committed_output_mismatch");
      const actual = await readFile(
        join(repositoryDir, ".clarissimi", "contributions.jsonl"),
        "utf8",
      );
      if (name === "same-size approval rewrite") {
        assert.ok(actual.includes('"maintainerApprovalStatus":"rejected"'));
        assert.equal(
          Buffer.byteLength(actual),
          staging.manifest.files.find((file) => file.path === ".clarissimi/contributions.jsonl")
            .bytes,
        );
      } else assert.ok(actual.includes('"unexpected":true'));
      assert.notEqual(await git(repositoryDir, ["rev-parse", "HEAD"]), base);
      assert.equal(await git(repositoryDir, ["status", "--short"]), "");
    });
  });
}

function git(repositoryDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repositoryDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `git ${args.join(" ")} failed.`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}
