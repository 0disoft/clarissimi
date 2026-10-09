import assert from "node:assert/strict";
import {
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
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

for (const command of ["rebuild", "import-draft"]) {
  for (const linkKind of ["symlink", "dangling", "hardlink", "overlap"]) {
    test(`${command} handles a ${linkKind} derived output without discarding linked files`, async (context) => {
      const dir = await mkdtemp(join(tmpdir(), "clarissimi-derived-links-"));
      try {
        const draft = await readFile(
          new URL("../../../fixtures/approved-draft.json", import.meta.url),
          "utf8",
        );
        const draftPath = join(dir, "draft.json");
        const ledger = join(dir, "ledger.jsonl");
        const ledgerBefore = command === "rebuild" ? `${JSON.stringify(JSON.parse(draft))}\n` : "";
        const outDir = join(dir, "output");
        const markdown = join(outDir, "CONTRIBUTORS.md");
        const contributors = join(outDir, ".clarissimi", "contributors.json");
        const target = linkKind === "overlap" ? contributors : join(dir, "published.md");
        const previous = "existing published content\n";
        await mkdir(join(outDir, ".clarissimi", "static"), { recursive: true });
        await writeFile(draftPath, draft);
        await writeFile(ledger, ledgerBefore);
        await writeFile(contributors, previous);
        if (linkKind !== "dangling") {
          await writeFile(target, previous);
        }
        try {
          if (linkKind === "hardlink") {
            await link(target, markdown);
          } else {
            await symlink(target, markdown, "file");
          }
        } catch (error) {
          if (process.platform === "win32" && error.code === "EPERM") {
            context.skip("File symlinks require Windows developer mode or symlink privileges.");
            return;
          }
          throw error;
        }
        const before = await readdir(dir);
        let stdout = "";
        let stderr = "";
        const code = await runCli(
          [
            command,
            "--ledger",
            ledger,
            "--out-dir",
            outDir,
            "--json",
            ...(command === "import-draft"
              ? ["--draft", draftPath, "--allow-legacy-approval"]
              : []),
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
        assert.equal(stderr, "");
        const output = JSON.parse(stdout);
        if (linkKind === "symlink") {
          assert.equal(code, 0, stdout);
          assert.equal((await lstat(markdown)).isSymbolicLink(), true);
          assert.match(await readFile(target, "utf8"), /octocat/);
          assert.equal(await readFile(markdown, "utf8"), await readFile(target, "utf8"));
        } else {
          assert.equal(code, 7, stdout);
          assert.equal(output.ok, false);
          assert.match(
            output.message,
            linkKind === "hardlink"
              ? /hard links/i
              : linkKind === "dangling"
                ? /target.*does not exist/i
                : /same destination/i,
          );
          assert.equal(await readFile(ledger, "utf8"), ledgerBefore);
          assert.equal(await readFile(contributors, "utf8"), previous);
          if (linkKind === "dangling") {
            assert.equal((await lstat(markdown)).isSymbolicLink(), true);
            await assert.rejects(readFile(target, "utf8"), { code: "ENOENT" });
          } else {
            assert.equal(await readFile(target, "utf8"), previous);
            assert.equal(await readFile(markdown, "utf8"), previous);
          }
          assert.deepEqual(await readdir(dir), before);
          assert.deepEqual(await readdir(outDir), [".clarissimi", "CONTRIBUTORS.md"]);
          assert.deepEqual((await readdir(join(outDir, ".clarissimi"))).sort(), [
            "contributors.json",
            "static",
          ]);
          assert.deepEqual(await readdir(join(outDir, ".clarissimi", "static")), []);
        }
        assert.equal(await readFile(draftPath, "utf8"), draft);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}
