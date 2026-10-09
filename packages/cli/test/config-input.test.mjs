import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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

for (const parentKind of ["file", "dangling-link"]) {
  test(`default config discovery rejects a ${parentKind} parent instead of accepting defaults`, async (context) => {
    await withTempDir(async (dir) => {
      const parent = join(dir, ".clarissimi");
      if (parentKind === "file") {
        await writeFile(parent, "existing parent file\n");
      } else {
        try {
          await symlink(
            join(dir, "missing-config-directory"),
            parent,
            process.platform === "win32" ? "junction" : "dir",
          );
        } catch (error) {
          if (process.platform === "win32" && error.code === "EPERM") {
            context.skip("Directory symlinks require symlink privileges.");
            return;
          }
          throw error;
        }
      }
      const ledger = join(dir, "ledger.jsonl");
      const markdown = join(dir, "CONTRIBUTORS.md");
      const page = join(dir, "index.html");
      await writeFile(ledger, "\n");
      await writeFile(markdown, "existing contributor history\n");
      await writeFile(page, "existing contributor page\n");
      const before = await readdir(dir);
      for (const command of configCommands) {
        const ledgerFlags = ["import-draft", "rebuild", "render-page"].includes(command[0])
          ? ["--ledger", ledger]
          : [];
        for (const jsonFlags of [[], ["--json"]]) {
          const result = await run([...command, ...ledgerFlags, ...jsonFlags], dir);
          assert.equal(result.exitCode, 2, result.stdout + result.stderr);
          const message = jsonFlags.length > 0 ? JSON.parse(result.stdout).message : result.stderr;
          assert.match(message, /config.*parent.*directory/i);
          assert.match(message, /\.clarissimi/);
          assert.match(message, /--config/);
          assert.equal(jsonFlags.length > 0 ? result.stderr : result.stdout, "");
        }
      }
      assert.equal(await readFile(ledger, "utf8"), "\n");
      assert.equal(await readFile(markdown, "utf8"), "existing contributor history\n");
      assert.equal(await readFile(page, "utf8"), "existing contributor page\n");
      assert.deepEqual(await readdir(dir), before);
      assert.equal((await lstat(parent)).isSymbolicLink(), parentKind === "dangling-link");
      if (parentKind === "file") {
        assert.equal(await readFile(parent, "utf8"), "existing parent file\n");
      }
      await writeFile(join(dir, "selected.json"), "{}");
      const selected = await run(["validate-config", "--config", "selected.json", "--json"], dir);
      assert.equal(selected.exitCode, 0, selected.stdout + selected.stderr);
    });
  });
}

test("default config discovery accepts a directory alias with no config", async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, "config-directory");
    await mkdir(target);
    await symlink(
      target,
      join(dir, ".clarissimi"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const result = await run(["validate-config", "--json"], dir);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).configPath, null);
  });
});

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

for (const configPath of ["clarissimi.config.ts", ".clarissimi/config.json"]) {
  for (const command of configCommands) {
    test(`${command[0]} rejects a default config directory at ${configPath} without changing outputs`, async () => {
      await withTempDir(async (dir) => {
        await mkdir(join(dir, configPath), { recursive: true });
        const ledger = join(dir, ".clarissimi", "contributions.jsonl");
        const markdown = join(dir, "CONTRIBUTORS.md");
        const page = join(dir, "index.html");
        await mkdir(join(dir, ".clarissimi"), { recursive: true });
        await writeFile(ledger, "\n");
        await writeFile(markdown, "existing contributor history\n");
        await writeFile(page, "existing contributor page\n");
        const before = await readdir(dir);
        const clarissimiBefore = await readdir(join(dir, ".clarissimi"));

        for (const jsonFlags of [[], ["--json"]]) {
          const result = await run([...command, ...jsonFlags], dir);
          assert.equal(result.exitCode, 2, result.stdout + result.stderr);
          const message = jsonFlags.length > 0 ? JSON.parse(result.stdout).message : result.stderr;
          assert.match(message, /config.*regular file/i);
          assert.ok(message.includes(configPath), message);
          assert.equal(jsonFlags.length > 0 ? result.stderr : result.stdout, "");
        }

        assert.equal(await readFile(ledger, "utf8"), "\n");
        assert.equal(await readFile(markdown, "utf8"), "existing contributor history\n");
        assert.equal(await readFile(page, "utf8"), "existing contributor page\n");
        assert.deepEqual(await readdir(dir), before);
        assert.deepEqual(await readdir(join(dir, ".clarissimi")), clarissimiBefore);
      });
    });
  }
}

test("an explicit config bypasses a default config directory", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "clarissimi.config.ts"));
    await writeFile(join(dir, "selected.json"), "{}");
    const result = await run(["validate-config", "--config", "selected.json", "--json"], dir);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).configPath, "selected.json");
  });
});

test("a default config directory and a valid default config require explicit selection", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "clarissimi.config.ts"));
    await mkdir(join(dir, ".clarissimi"));
    await writeFile(join(dir, ".clarissimi", "config.json"), "{}");
    const ambiguous = await run(["validate-config", "--json"], dir);
    assert.equal(ambiguous.exitCode, 2, ambiguous.stdout + ambiguous.stderr);
    assert.match(JSON.parse(ambiguous.stdout).message, /Multiple.*--config/);

    const selected = await run(
      ["validate-config", "--config", ".clarissimi/config.json", "--json"],
      dir,
    );
    assert.equal(selected.exitCode, 0, selected.stdout + selected.stderr);
    assert.equal(JSON.parse(selected.stdout).configPath, ".clarissimi/config.json");
  });
});
