import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

for (const linkKind of ["file", "directory"]) {
  test(`ledger readers reject a dangling ${linkKind} link instead of treating it as an empty ledger`, async (context) => {
    await withTempDir(async (dir) => {
      const target = join(dir, "missing-target");
      const alias =
        linkKind === "file"
          ? join(dir, ".clarissimi", "contributions.jsonl")
          : join(dir, ".clarissimi");
      if (linkKind === "file") {
        await mkdir(join(dir, ".clarissimi"));
      }
      try {
        await symlink(
          target,
          alias,
          linkKind === "file" ? "file" : process.platform === "win32" ? "junction" : "dir",
        );
      } catch (error) {
        if (process.platform === "win32" && error.code === "EPERM") {
          context.skip("File symlinks require Windows developer mode or symlink privileges.");
          return;
        }
        throw error;
      }
      const page = join(dir, "index.html");
      await writeFile(page, "existing contributor page\n");
      const before = await readdir(dir);
      for (const command of readCommands) {
        const outputFlags = command[0] === "render-page" ? ["--out-dir", dir] : [];
        for (const ledgerFlags of [[], ["--ledger", ".clarissimi/contributions.jsonl"]]) {
          const result = await run([...command, ...ledgerFlags, ...outputFlags, "--json"], dir);
          assert.equal(result.exitCode, 3, result.stdout + result.stderr);
          assert.equal(result.stderr, "");
          const output = JSON.parse(result.stdout);
          assert.equal(output.ok, false);
          assert.match(output.message, /ledger.*symbolic link.*target.*does not exist/i);
          assert.match(output.message, /restore|select/i);
        }
      }
      assert.equal((await lstat(alias)).isSymbolicLink(), true);
      assert.equal(await readFile(page, "utf8"), "existing contributor page\n");
      assert.deepEqual(await readdir(dir), before);
    });
  });
}

for (const invalidLedger of ["invalid-json", "invalid-schema", "duplicate-records", "directory"]) {
  test(`import-draft reports ${invalidLedger} as an invalid ledger and preserves outputs`, async () => {
    await withTempDir(async (dir) => {
      const draftPath = fileURLToPath(
        new URL("../../../fixtures/approved-draft.json", import.meta.url),
      );
      const record = JSON.parse(await readFile(draftPath, "utf8"));
      const ledger = join(dir, "ledger.jsonl");
      const ledgerText =
        invalidLedger === "invalid-json"
          ? "not JSON\n"
          : invalidLedger === "invalid-schema"
            ? "{}\n"
            : `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`;
      if (invalidLedger === "directory") {
        await mkdir(ledger);
        await writeFile(join(ledger, "keep.txt"), "existing directory contents\n");
      } else {
        await writeFile(ledger, ledgerText);
      }
      await writeFile(join(dir, "CONTRIBUTORS.md"), "existing contributor history\n");
      const before = await readdir(dir);

      for (const jsonFlags of [[], ["--json"]]) {
        const result = await run(
          [
            "import-draft",
            "--draft",
            draftPath,
            "--allow-legacy-approval",
            "--ledger",
            ledger,
            "--out-dir",
            dir,
            ...jsonFlags,
          ],
          dir,
        );
        assert.equal(result.exitCode, 3, result.stdout + result.stderr);
        assert.equal(jsonFlags.length > 0 ? result.stderr : result.stdout, "");
        const message = jsonFlags.length > 0 ? JSON.parse(result.stdout).message : result.stderr;
        assert.match(message, /ledger/i);
      }

      assert.equal(
        await readFile(join(dir, "CONTRIBUTORS.md"), "utf8"),
        "existing contributor history\n",
      );
      if (invalidLedger === "directory") {
        assert.equal(
          await readFile(join(ledger, "keep.txt"), "utf8"),
          "existing directory contents\n",
        );
      } else {
        assert.equal(await readFile(ledger, "utf8"), ledgerText);
      }
      assert.deepEqual(await readdir(dir), before);
    });
  });
}

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

for (const command of readCommands) {
  for (const invalidPath of [
    "directory",
    "blocked-parent",
    "default-directory",
    "default-parent",
  ]) {
    test(`${command[0]} rejects a ${invalidPath} ledger path and preserves outputs`, async () => {
      await withTempDir(async (dir) => {
        let ledgerFlags;
        if (invalidPath === "directory") {
          await mkdir(join(dir, "ledger.jsonl"));
          ledgerFlags = ["--ledger", "ledger.jsonl"];
        } else if (invalidPath === "blocked-parent") {
          await writeFile(join(dir, "ledger.jsonl"), "parent is a file\n");
          ledgerFlags = ["--ledger", "ledger.jsonl/child.jsonl"];
        } else if (invalidPath === "default-directory") {
          await mkdir(join(dir, ".clarissimi", "contributions.jsonl"), { recursive: true });
          ledgerFlags = [];
        } else {
          await writeFile(join(dir, ".clarissimi"), "parent is a file\n");
          ledgerFlags = [];
        }
        const markdownPath = join(dir, "CONTRIBUTORS.md");
        const pagePath = join(dir, "index.html");
        await writeFile(markdownPath, "existing contributor history\n");
        await writeFile(pagePath, "existing contributor page\n");
        const before = await readdir(dir);
        const outputFlags = ["rebuild", "render-page"].includes(command[0])
          ? ["--out-dir", dir]
          : [];

        for (const jsonFlags of [[], ["--json"]]) {
          const result = await run([...command, ...ledgerFlags, ...outputFlags, ...jsonFlags], dir);
          assert.equal(result.exitCode, 3, result.stdout + result.stderr);
          const message = jsonFlags.length > 0 ? JSON.parse(result.stdout).message : result.stderr;
          assert.match(message, /ledger.*regular file/i);
          assert.equal(jsonFlags.length > 0 ? result.stderr : result.stdout, "");
          if (jsonFlags.length > 0) {
            assert.equal(JSON.parse(result.stdout).ok, false);
          }
        }

        assert.equal(await readFile(markdownPath, "utf8"), "existing contributor history\n");
        assert.equal(await readFile(pagePath, "utf8"), "existing contributor page\n");
        assert.deepEqual(await readdir(dir), before);
      });
    });
  }
}
