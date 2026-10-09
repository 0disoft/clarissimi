import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-config-input-"));
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
    fetch: async () => {
      throw new Error("Missing config must fail before provider requests.");
    },
  });
  return { exitCode, stdout, stderr };
}

const fixturePath = (name) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const configCommands = [
  ["validate-config"],
  ["recognize", "--fixture", fixturePath("merged-pr-basic.json")],
  [
    "import-draft",
    "--draft",
    fixturePath("approved-draft.json"),
    "--allow-legacy-approval",
    "--out-dir",
    ".",
  ],
  ["rebuild", "--out-dir", "."],
  ["render-page", "--out-dir", "."],
];

for (const command of configCommands) {
  test(`${command[0]} rejects a missing explicit config before changing outputs`, async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, ".clarissimi"));
      const ledger = join(dir, ".clarissimi", "contributions.jsonl");
      const markdown = join(dir, "CONTRIBUTORS.md");
      const page = join(dir, "index.html");
      await writeFile(ledger, "\n");
      await writeFile(markdown, "existing contributor history\n");
      await writeFile(page, "existing contributor page\n");
      const result = await run([...command, "--config", "typo.json", "--json"], dir);

      assert.equal(result.exitCode, 2, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).ok, false);
      assert.match(JSON.parse(result.stdout).message, /config.*does not exist|regular file/i);
      assert.equal(result.stderr, "");
      assert.equal(await readFile(ledger, "utf8"), "\n");
      assert.equal(await readFile(markdown, "utf8"), "existing contributor history\n");
      assert.equal(await readFile(page, "utf8"), "existing contributor page\n");
      assert.deepEqual(await readdir(join(dir, ".clarissimi")), ["contributions.jsonl"]);
    });
  });
}

test("an explicitly selected config directory is rejected instead of using defaults", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "config.json"));
    const result = await run(["validate-config", "--config", "config.json", "--json"], dir);
    assert.equal(result.exitCode, 2, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).message, /regular file/i);
  });
});
