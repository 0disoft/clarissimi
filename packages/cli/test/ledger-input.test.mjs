import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-ledger-input-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
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

const readCommands = [
  ["validate-ledger"],
  ["rebuild"],
  ["render-page"],
  ["analytics", "recent-share"],
];

for (const command of readCommands) {
  test(`${command[0]} rejects an explicitly selected missing ledger and preserves outputs`, async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, ".clarissimi"));
      const ledgerPath = join(dir, ".clarissimi", "contributions.jsonl");
      const markdownPath = join(dir, "CONTRIBUTORS.md");
      const pagePath = join(dir, "index.html");
      await writeFile(ledgerPath, "\n");
      await writeFile(markdownPath, "existing contributor history\n");
      await writeFile(pagePath, "existing contributor page\n");
      const outputFlags = ["rebuild", "render-page"].includes(command[0]) ? ["--out-dir", dir] : [];

      const result = await run(
        [...command, "--ledger", "typo.jsonl", ...outputFlags, "--json"],
        dir,
      );

      assert.equal(result.exitCode, 3, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).ok, false);
      assert.match(JSON.parse(result.stdout).message, /ledger.*does not exist/i);
      assert.equal(result.stderr, "");
      assert.equal(await readFile(ledgerPath, "utf8"), "\n");
      assert.equal(await readFile(markdownPath, "utf8"), "existing contributor history\n");
      assert.equal(await readFile(pagePath, "utf8"), "existing contributor page\n");
      assert.deepEqual(await readdir(join(dir, ".clarissimi")), ["contributions.jsonl"]);
    });
  });
}

test("ledger readers retain empty defaults for a new repository", async () => {
  await withTempDir(async (dir) => {
    for (const command of readCommands) {
      const outputFlags = command[0] === "render-page" ? ["--out-dir", "page"] : [];
      const result = await run([...command, ...outputFlags, "--json"], dir);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).ok, true);
    }
  });
});

test("an explicitly selected empty ledger is a valid existing input", async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, "empty.jsonl"), "");
    for (const command of readCommands) {
      const outputFlags = command[0] === "render-page" ? ["--out-dir", "page"] : [];
      const result = await run(
        [...command, "--ledger", "empty.jsonl", ...outputFlags, "--json"],
        dir,
      );
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    }
  });
});
