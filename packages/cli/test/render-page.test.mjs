import assert from "node:assert/strict";
import fs, {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

function assessment(overrides = {}) {
  return {
    schemaVersion: "clarissimi.assessment/v1",
    contributor: {
      platform: "github",
      id: "123456",
      login: "octocat",
      profileUrl: "https://github.com/octocat",
    },
    contributionType: "documentation",
    affectedArea: "contributor onboarding",
    impactLevel: "medium",
    evidenceSummary: "Documented contributor setup.",
    evidenceRefs: [
      {
        kind: "pull_request",
        id: "PR-42",
        url: "https://github.com/example/project/pull/42",
        title: "Document contributor setup",
      },
    ],
    suggestedBadge: "Guide Builder",
    publicRecognitionText: "Improved contributor onboarding documentation.",
    confidence: 0.9,
    maintainerApprovalStatus: "approved",
    source: {
      repository: "example/project",
      event: "merged_pull_request",
      pullRequestNumber: 42,
      mergedAt: "2026-07-08T00:00:00.000Z",
    },
    ...overrides,
  };
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-render-page-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function run(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
}

test("render-page writes one deployable index.html and reports its path", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "docs", "contributors");
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(assessment())}\n`, "utf8");

    const result = await run(
      ["render-page", "--ledger", ledger, "--out-dir", outDir, "--json"],
      dir,
    );
    const output = JSON.parse(result.stdout);
    const page = await readFile(join(outDir, "index.html"), "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.command, "render-page");
    assert.equal(output.pagePath, join(outDir, "index.html"));
    assert.deepEqual(output.files, ["index.html"]);
    assert.match(page, /example\/project contributors/);
    assert.match(page, /Improved contributor onboarding documentation\./);
  });
});

test("render-page requires an explicit output directory before reading config", async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, "clarissimi.config.ts"), "not valid TypeScript\n", "utf8");

    const result = await run(["render-page", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(output.message, "render-page requires --out-dir <path>.");
  });
});

test("render-page preserves automation in the ledger while honoring the display opt-out", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "site");
    const bot = assessment({
      contributor: {
        platform: "github",
        id: "200",
        login: "dependabot[bot]",
        profileUrl: "https://github.com/apps/dependabot",
        kind: "bot",
      },
    });
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(bot)}\n`, "utf8");

    const result = await run(
      [
        "render-page",
        "--ledger",
        ledger,
        "--out-dir",
        outDir,
        "--exclude-automation-contributors",
        "--json",
      ],
      dir,
    );
    const page = await readFile(join(outDir, "index.html"), "utf8");
    const ledgerText = await readFile(ledger, "utf8");

    assert.equal(result.exitCode, 0);
    assert.equal(page.includes("dependabot"), false);
    assert.equal(ledgerText.includes("dependabot[bot]"), true);
  });
});

test("render-page rejects duplicate ledger identities before writing", async () => {
  await withTempDir(async (dir) => {
    const ledgerDir = join(dir, ".clarissimi");
    const ledger = join(ledgerDir, "contributions.jsonl");
    const outDir = join(dir, "site");
    const record = assessment();
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(ledger, `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`, "utf8");

    const result = await run(
      ["render-page", "--ledger", ledger, "--out-dir", outDir, "--json"],
      dir,
    );

    assert.equal(result.exitCode, 3);
    await assert.rejects(readFile(join(outDir, "index.html"), "utf8"));
  });
});

for (const failureStage of ["write", "rename"]) {
  test(`render-page preserves its previous page when ${failureStage} fails`, async () => {
    await withTempDir(async (dir) => {
      const ledger = join(dir, "ledger.jsonl");
      const page = join(dir, "index.html");
      const previous = "previous published page\n";
      await writeFile(ledger, "\n");
      await writeFile(page, previous);
      const before = await readdir(dir);
      const originalWrite = fs.writeFile;
      const originalRename = fs.rename;
      const failure = Object.assign(new Error(`Injected page ${failureStage} failure.`), {
        code: failureStage === "write" ? "ENOSPC" : "EIO",
      });
      let result;
      try {
        fs.writeFile = async (path, value, options) => {
          if (failureStage === "write" && typeof path === "string" && path.startsWith(dir)) {
            await originalWrite(path, value.slice(0, 8), options);
            throw failure;
          }
          return originalWrite(path, value, options);
        };
        fs.rename = async (from, to) => {
          if (failureStage === "rename" && to === page) {
            throw failure;
          }
          return originalRename(from, to);
        };
        syncBuiltinESMExports();
        result = await run(["render-page", "--ledger", ledger, "--out-dir", dir, "--json"], dir);
      } finally {
        fs.writeFile = originalWrite;
        fs.rename = originalRename;
        syncBuiltinESMExports();
      }
      assert.equal(result.exitCode, 7, result.stdout + result.stderr);
      assert.equal(result.stderr, "");
      assert.match(JSON.parse(result.stdout).message, /Injected page/);
      assert.equal(await readFile(page, "utf8"), previous);
      assert.equal(await readFile(ledger, "utf8"), "\n");
      assert.deepEqual(await readdir(dir), before);
    });
  });
}

test("render-page preserves an existing file symlink while replacing its target", async (context) => {
  await withTempDir(async (dir) => {
    const target = join(dir, "published.html");
    const alias = join(dir, "index.html");
    await writeFile(target, "previous published page\n");
    try {
      await symlink(target, alias, "file");
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        context.skip("File symlinks require Windows developer mode or symlink privileges.");
        return;
      }
      throw error;
    }
    const result = await run(["render-page", "--out-dir", dir, "--json"], dir);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).pagePath, alias);
    assert.equal((await lstat(alias)).isSymbolicLink(), true);
    assert.match(await readFile(target, "utf8"), /^<!doctype html>/);
    assert.deepEqual((await readdir(dir)).sort(), ["index.html", "published.html"]);
  });
});

test("render-page refuses a hard-linked page before changing either alias", async () => {
  await withTempDir(async (dir) => {
    const page = join(dir, "index.html");
    const alias = join(dir, "published.html");
    const previous = "previous published page\n";
    await writeFile(page, previous);
    await link(page, alias);
    const result = await run(["render-page", "--out-dir", dir, "--json"], dir);
    assert.equal(result.exitCode, 7, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).message, /multiple hard links/);
    assert.equal(await readFile(page, "utf8"), previous);
    assert.equal(await readFile(alias, "utf8"), previous);
  });
});
