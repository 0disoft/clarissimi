import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rm,
  rmdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

for (const linkKind of ["file", "directory"]) {
  test(`import preserves a dangling ${linkKind} ledger link instead of replacing it`, async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "clarissimi-dangling-ledger-"));
    try {
      const draft = await readFile(
        new URL("../../../fixtures/approved-draft.json", import.meta.url),
        "utf8",
      );
      await writeFile(join(dir, "approved.json"), draft);
      await writeFile(join(dir, "CONTRIBUTORS.md"), "existing contributor history\n");
      const alias = join(dir, "ledger-alias");
      const target = join(dir, "missing-target");
      if (linkKind === "directory") {
        await mkdir(target);
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
      if (linkKind === "directory") {
        await rmdir(target);
      }
      const originalLink = await readlink(alias);
      const before = await readdir(dir);
      let stdout = "";
      let stderr = "";
      const code = await runCli(
        [
          "import-draft",
          "--draft",
          "approved.json",
          "--allow-legacy-approval",
          "--ledger",
          linkKind === "file" ? alias : join(alias, "contributions.jsonl"),
          "--out-dir",
          ".",
          "--json",
        ],
        {
          cwd: dir,
          stdout: (value) => {
            stdout += value;
          },
          stderr: (value) => {
            stderr += value;
          },
        },
      );
      assert.equal(code, 7, stdout + stderr);
      assert.equal(stderr, "");
      const output = JSON.parse(stdout);
      assert.equal(output.ok, false);
      assert.match(output.message, /symbolic link.*target.*does not exist/i);
      assert.match(output.message, /restore|select/i);
      assert.equal((await lstat(alias)).isSymbolicLink(), true);
      assert.equal(await readlink(alias), originalLink);
      assert.equal(await readFile(join(dir, "approved.json"), "utf8"), draft);
      assert.equal(
        await readFile(join(dir, "CONTRIBUTORS.md"), "utf8"),
        "existing contributor history\n",
      );
      assert.deepEqual(await readdir(dir), before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
