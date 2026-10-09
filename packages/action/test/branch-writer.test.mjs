import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  ProposalBranchWriterError,
  assertProposalBaseCheckout,
  proposalBranchName,
  stageProposalDraftReviewOutput,
  stageProposalRecognitionOutputs,
  writeProposalBranch,
} from "../dist/index.js";

const source = {
  repository: "sample/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
  mergedAt: "2026-07-08T00:00:00.000Z",
};

function assessment(overrides = {}) {
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
    ...overrides,
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-branch-writer-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test("writes staged outputs to a deterministic proposal branch without mutating main", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepository(repositoryDir);
    const baseSha = await git(repositoryDir, ["rev-parse", "main"]);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 2,
    });

    const result = await writeProposalBranch({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      baseBranch: "main",
    });

    assert.equal(result.branchName, "clarissimi/recognition/merged_pull_request-42");
    assert.equal(result.baseBranch, "main");
    assert.equal(result.baseCommitSha, baseSha);
    assert.equal(await git(repositoryDir, ["rev-parse", "main"]), baseSha);
    assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
    assert.notEqual(result.commitSha, baseSha);
    assert.deepEqual(
      [...result.changedFiles].sort(),
      staging.manifest.files.map((file) => file.path).sort(),
    );
    assert.equal(await git(repositoryDir, ["rev-parse", result.branchName]), result.commitSha);

    const stagedMarkdown = await readFile(join(stagedOutputDir, "CONTRIBUTORS.md"), "utf8");
    assert.equal(
      await git(repositoryDir, ["show", `${result.branchName}:CONTRIBUTORS.md`]),
      stagedMarkdown.trim(),
    );
    assert.equal(
      await git(repositoryDir, ["show", "-s", "--format=%an <%ae>", result.branchName]),
      "Clarissimi Bot <clarissimi-bot@users.noreply.github.com>",
    );
  });
});

test("writes staged draft outputs to a distinct draft proposal branch", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepository(repositoryDir);
    const staging = await stageProposalDraftReviewOutput({
      outputDir: stagedOutputDir,
      assessments: [assessment({ maintainerApprovalStatus: "draft" })],
      redactionMatchCount: 1,
    });

    const result = await writeProposalBranch({
      repositoryDir,
      stagedOutputDir,
      manifest: staging.manifest,
      baseBranch: "main",
    });

    assert.equal(result.branchName, "clarissimi/drafts/merged_pull_request-42");
    assert.deepEqual(result.changedFiles, [
      ".clarissimi/drafts/sample-project-merged_pull_request-42.json",
    ]);
    assert.equal(
      await git(repositoryDir, ["show", "-s", "--format=%s", result.branchName]),
      "Clarissimi draft review: merged_pull_request #42",
    );
  });
});

test("rejects missing branch writer metadata before git mutation", async () => {
  await assert.rejects(
    () =>
      writeProposalBranch({
        repositoryDir: "repo",
        stagedOutputDir: "staged",
        manifest: {
          mode: "propose",
          source,
          assessmentCount: 1,
          approvalSummary: {
            approved: 1,
            autoApproved: 0,
          },
          redactionMatchCount: 0,
          files: [],
        },
        baseBranch: "main",
      }),
    ProposalBranchWriterError,
  );
});

test("rejects a dirty index before proposal branch mutation", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepository(repositoryDir);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 0,
    });
    await writeFile(join(repositoryDir, "unrelated.txt"), "must not be committed\n", "utf8");
    await git(repositoryDir, ["add", "unrelated.txt"]);
    const mainSha = await git(repositoryDir, ["rev-parse", "main"]);

    await assert.rejects(
      () =>
        writeProposalBranch({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          baseBranch: "main",
        }),
      (error) => error instanceof ProposalBranchWriterError && error.code === "dirty_worktree",
    );

    assert.equal(await git(repositoryDir, ["rev-parse", "main"]), mainSha);
    assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
    assert.equal(await git(repositoryDir, ["diff", "--cached", "--name-only"]), "unrelated.txt");
  });
});

test("restores owned paths when proposal commit fails", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepository(repositoryDir);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 0,
    });
    const hookPath = join(repositoryDir, ".git", "hooks", "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\nexit 1\n", { encoding: "utf8", mode: 0o755 });
    const mainSha = await git(repositoryDir, ["rev-parse", "main"]);

    await assert.rejects(
      () =>
        writeProposalBranch({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          baseBranch: "main",
        }),
      (error) => error instanceof ProposalBranchWriterError && error.code === "git_command_failed",
    );

    assert.equal(await git(repositoryDir, ["rev-parse", "main"]), mainSha);
    assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
    assert.equal(await git(repositoryDir, ["status", "--porcelain", "--untracked-files=all"]), "");
  });
});

for (const existingLedger of [false, true]) {
  test(`restores the original checkout after a later staged verification failure (${existingLedger ? "tracked ledger" : "new ledger"})`, async () => {
    await withTempDir(async (dir) => {
      const repositoryDir = join(dir, "repo");
      const stagedOutputDir = join(dir, "staged");
      await initRepository(repositoryDir);
      const ledgerPath = join(repositoryDir, ".clarissimi", "contributions.jsonl");
      const notesPath = join(repositoryDir, ".clarissimi", "notes.txt");
      await mkdir(join(repositoryDir, ".clarissimi"));
      await writeFile(notesPath, "keep unrelated local notes\n");
      await writeFile(join(repositoryDir, ".git", "info", "exclude"), ".clarissimi/notes.txt\n");
      if (existingLedger) {
        await writeFile(ledgerPath, "\n");
        await git(repositoryDir, ["add", ".clarissimi/contributions.jsonl"]);
        await git(repositoryDir, ["commit", "-m", "Add empty recognition ledger"]);
      }
      const staging = await stageProposalRecognitionOutputs({
        outputDir: stagedOutputDir,
        assessments: [assessment()],
        redactionMatchCount: 0,
      });
      const mainSha = await git(repositoryDir, ["rev-parse", "main"]);
      const files = staging.manifest.files.map((file, index) =>
        index === 1 ? { ...file, sha256: "0".repeat(64) } : file,
      );

      await assert.rejects(
        () =>
          writeProposalBranch({
            repositoryDir,
            stagedOutputDir,
            manifest: { ...staging.manifest, files },
            baseBranch: "main",
          }),
        (error) =>
          error instanceof ProposalBranchWriterError && error.code === "staged_file_hash_mismatch",
      );

      assert.equal(await git(repositoryDir, ["rev-parse", "main"]), mainSha);
      assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
      assert.equal(
        await git(repositoryDir, ["status", "--porcelain", "--untracked-files=all"]),
        "",
      );
      assert.equal(await readFile(notesPath, "utf8"), "keep unrelated local notes\n");
      if (existingLedger) {
        assert.equal(await readFile(ledgerPath, "utf8"), "\n");
      } else {
        await assert.rejects(readFile(ledgerPath), { code: "ENOENT" });
      }
    });
  });
}

for (const startingRef of ["main", "proposal"]) {
  test(`preserves an existing proposal commit when rewriting fails from ${startingRef}`, async () => {
    await withTempDir(async (dir) => {
      const repositoryDir = join(dir, "repo");
      const stagedOutputDir = join(dir, "staged");
      await initRepository(repositoryDir);
      const staging = await stageProposalRecognitionOutputs({
        outputDir: stagedOutputDir,
        assessments: [assessment()],
        redactionMatchCount: 0,
      });
      const first = await writeProposalBranch({
        repositoryDir,
        stagedOutputDir,
        manifest: staging.manifest,
        baseBranch: "main",
      });
      const originalRef = startingRef === "main" ? "main" : first.branchName;
      await git(repositoryDir, ["checkout", originalRef]);
      const originalSha = await git(repositoryDir, ["rev-parse", "HEAD"]);
      const files = staging.manifest.files.map((file, index) =>
        index === 1 ? { ...file, sha256: "0".repeat(64) } : file,
      );

      await assert.rejects(
        () =>
          writeProposalBranch({
            repositoryDir,
            stagedOutputDir,
            manifest: { ...staging.manifest, files },
            baseBranch: "main",
          }),
        (error) =>
          error instanceof ProposalBranchWriterError && error.code === "staged_file_hash_mismatch",
      );

      assert.equal(await git(repositoryDir, ["rev-parse", first.branchName]), first.commitSha);
      assert.equal(await git(repositoryDir, ["branch", "--show-current"]), originalRef);
      assert.equal(await git(repositoryDir, ["rev-parse", "HEAD"]), originalSha);
      assert.equal(
        await git(repositoryDir, ["status", "--porcelain", "--untracked-files=all"]),
        "",
      );
      if (startingRef === "proposal") {
        assert.equal(
          await readFile(join(repositoryDir, "CONTRIBUTORS.md"), "utf8"),
          await readFile(join(stagedOutputDir, "CONTRIBUTORS.md"), "utf8"),
        );
      }
    });
  });
}

test("refuses to overwrite existing proposal branches with unowned changes", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    await initRepository(repositoryDir);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 0,
    });
    const branchName = proposalBranchName(staging.manifest);

    await git(repositoryDir, ["checkout", "-b", branchName, "main"]);
    await writeFile(
      join(repositoryDir, "README.md"),
      "# Edited outside Clarissimi outputs\n",
      "utf8",
    );
    await git(repositoryDir, ["add", "README.md"]);
    await git(repositoryDir, ["commit", "-m", "Edit readme outside generated outputs"]);
    await git(repositoryDir, ["checkout", "main"]);
    const mainSha = await git(repositoryDir, ["rev-parse", "main"]);

    await assert.rejects(
      () =>
        writeProposalBranch({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          baseBranch: "main",
        }),
      (error) =>
        error instanceof ProposalBranchWriterError &&
        error.code === "existing_branch_has_unowned_changes",
    );

    assert.equal(await git(repositoryDir, ["rev-parse", "main"]), mainSha);
    assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
  });
});

test("rejects repository output paths that traverse a junction before writing outside the repository", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    const stagedOutputDir = join(dir, "staged");
    const externalDir = join(dir, "external");
    const externalLedger = join(externalDir, "contributions.jsonl");
    await initRepository(repositoryDir);
    await mkdir(externalDir);
    await writeFile(externalLedger, "EXTERNAL_SENTINEL\n", "utf8");
    await symlink(externalDir, join(repositoryDir, ".clarissimi"), "junction");
    const mainSha = await git(repositoryDir, ["rev-parse", "main"]);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: stagedOutputDir,
      assessments: [assessment()],
      redactionMatchCount: 0,
    });

    await assert.rejects(
      () =>
        writeProposalBranch({
          repositoryDir,
          stagedOutputDir,
          manifest: staging.manifest,
          baseBranch: "main",
        }),
      (error) =>
        error instanceof ProposalBranchWriterError &&
        error.code === "unsafe_repository_output_path",
    );

    assert.equal(await readFile(externalLedger, "utf8"), "EXTERNAL_SENTINEL\n");
    assert.equal(await git(repositoryDir, ["rev-parse", "main"]), mainSha);
    assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
  });
});

async function initRepository(repositoryDir) {
  await mkdir(repositoryDir);
  await git(repositoryDir, ["init", "-b", "main"]);
  await git(repositoryDir, ["config", "user.name", "Clarissimi Tests"]);
  await git(repositoryDir, ["config", "user.email", "clarissimi-tests.invalid"]);
  await writeFile(join(repositoryDir, "README.md"), "# Fixture Repository\n", "utf8");
  await git(repositoryDir, ["add", "README.md"]);
  await git(repositoryDir, ["commit", "-m", "Initial commit"]);
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

test("preserves edits in an existing local owned proposal without resetting it", async () => {
  await withTempDir(async (dir) => {
    const repositoryDir = join(dir, "repo");
    await initRepository(repositoryDir);
    const staging = await stageProposalRecognitionOutputs({
      outputDir: join(dir, "stage"),
      assessments: [assessment()],
      redactionMatchCount: 0,
    });
    const input = {
      repositoryDir,
      stagedOutputDir: staging.outputDir,
      manifest: staging.manifest,
      baseBranch: "main",
    };
    const first = await writeProposalBranch(input);
    assert.equal((await writeProposalBranch(input)).commitSha, first.commitSha);
    await git(repositoryDir, ["checkout", first.branchName]);
    await writeFile(join(repositoryDir, "CONTRIBUTORS.md"), "Reviewed text.\n");
    await git(repositoryDir, ["add", "CONTRIBUTORS.md"]);
    await git(repositoryDir, ["commit", "-m", "Review recognition"]);
    const reviewedSha = await git(repositoryDir, ["rev-parse", "HEAD"]);
    await git(repositoryDir, ["checkout", "main"]);
    await assert.rejects(
      writeProposalBranch(input),
      (error) => error.code === "existing_branch_content_changed",
    );
    assert.equal(await git(repositoryDir, ["rev-parse", first.branchName]), reviewedSha);
    assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "main");
  });
});

for (const remoteName of ["origin", "upstream"]) {
  test(`uses the fetched ${remoteName} base when the local branch is stale`, async () => {
    await withTempDir(async (dir) => {
      const repositoryDir = join(dir, "repo");
      await initRepository(repositoryDir);
      const staleSha = await git(repositoryDir, ["rev-parse", "main"]);
      await git(repositoryDir, ["checkout", "-b", "refreshed-base"]);
      await writeFile(join(repositoryDir, "README.md"), "Reviewed base.\n");
      await git(repositoryDir, ["add", "README.md"]);
      await git(repositoryDir, ["commit", "-m", "Advance reviewed base"]);
      const baseSha = await git(repositoryDir, ["rev-parse", "HEAD"]);
      const remoteRef = `refs/remotes/${remoteName}/main`;
      await git(repositoryDir, ["update-ref", remoteRef, baseSha]);
      const selectedRemote = remoteName === "origin" ? undefined : remoteName;
      assert.equal(
        await assertProposalBaseCheckout(repositoryDir, "main", selectedRemote),
        baseSha,
      );
      const staging = await stageProposalRecognitionOutputs({
        outputDir: join(dir, "staged"),
        assessments: [assessment()],
        redactionMatchCount: 0,
      });
      const input = {
        repositoryDir,
        stagedOutputDir: staging.outputDir,
        manifest: staging.manifest,
        baseBranch: "main",
        expectedBaseCommitSha: baseSha,
        ...(selectedRemote === undefined ? {} : { remoteName: selectedRemote }),
      };
      const proposal = await writeProposalBranch(input);
      assert.equal(proposal.baseCommitSha, baseSha);
      assert.equal(await git(repositoryDir, ["rev-parse", "main"]), staleSha);
      assert.equal(await git(repositoryDir, ["branch", "--show-current"]), "refreshed-base");
      assert.equal((await writeProposalBranch(input)).commitSha, proposal.commitSha);

      await git(repositoryDir, ["checkout", "main"]);
      await assert.rejects(
        assertProposalBaseCheckout(repositoryDir, "main", selectedRemote),
        (error) => error.code === "proposal_base_checkout_mismatch",
      );
      await git(repositoryDir, ["checkout", "refreshed-base"]);
      await git(repositoryDir, ["commit", "--allow-empty", "-m", "Concurrent base update"]);
      const advancedSha = await git(repositoryDir, ["rev-parse", "HEAD"]);
      await git(repositoryDir, ["update-ref", remoteRef, advancedSha]);
      await assert.rejects(
        writeProposalBranch(input),
        (error) => error.code === "proposal_base_changed",
      );
      assert.equal(
        await git(repositoryDir, ["rev-parse", proposal.branchName]),
        proposal.commitSha,
      );
      assert.equal(await git(repositoryDir, ["rev-parse", "main"]), staleSha);
    });
  });
}
