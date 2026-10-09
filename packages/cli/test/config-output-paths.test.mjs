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

for (const command of ["rebuild", "import-draft", "render-page"]) {
  for (const aliasKind of ["direct", "symlink", "hardlink", "default-symlink"]) {
    if (command === "render-page" && aliasKind === "direct") {
      continue;
    }
    test(`${command} preserves config reached through a ${aliasKind} output path`, async (context) => {
      const dir = await mkdtemp(join(tmpdir(), "clarissimi-config-output-"));
      try {
        const outDir = join(dir, "output");
        await mkdir(join(outDir, ".clarissimi", "static"), { recursive: true });
        const files = [
          ".clarissimi/contributors.json",
          "CONTRIBUTORS.md",
          ".clarissimi/static/contributions.json",
          "index.html",
        ];
        const selectedOutput =
          command === "render-page" ? "index.html" : ".clarissimi/contributors.json";
        const originals = new Map(
          files.map((file) => [
            join(outDir, file),
            file === selectedOutput ? "{}\n" : "existing output\n",
          ]),
        );
        for (const [path, text] of originals) {
          await writeFile(path, text);
        }
        const target = join(outDir, selectedOutput);
        const configPath =
          aliasKind === "direct"
            ? target
            : aliasKind === "default-symlink"
              ? join(dir, ".clarissimi", "config.json")
              : join(dir, "selected.json");
        if (aliasKind === "default-symlink") {
          await mkdir(join(dir, ".clarissimi"));
        }
        try {
          if (aliasKind === "hardlink") {
            await link(target, configPath);
          } else if (aliasKind !== "direct") {
            await symlink(target, configPath, "file");
          }
        } catch (error) {
          if (process.platform === "win32" && error.code === "EPERM") {
            context.skip("File symlinks require Windows developer mode or symlink privileges.");
            return;
          }
          throw error;
        }
        const draft = await readFile(
          new URL("../../../fixtures/approved-draft.json", import.meta.url),
          "utf8",
        );
        const draftPath = join(dir, "draft.json");
        const ledger = join(dir, "ledger.jsonl");
        await writeFile(draftPath, draft);
        await writeFile(ledger, "\n");
        const before = await readdir(dir);
        for (const jsonFlags of [[], ["--json"]]) {
          let stdout = "";
          let stderr = "";
          const code = await runCli(
            [
              command,
              "--ledger",
              ledger,
              "--out-dir",
              outDir,
              ...(aliasKind === "default-symlink" ? [] : ["--config", configPath]),
              ...(command === "import-draft"
                ? ["--draft", draftPath, "--allow-legacy-approval"]
                : []),
              ...jsonFlags,
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
          assert.equal(code, 1, stdout + stderr);
          const message = jsonFlags.length > 0 ? JSON.parse(stdout).message : stderr;
          assert.match(message, /output.*overlaps.*config/i);
          assert.equal(jsonFlags.length > 0 ? stderr : stdout, "");
        }
        assert.equal(await readFile(configPath, "utf8"), "{}\n");
        assert.equal(await readFile(ledger, "utf8"), "\n");
        assert.equal(await readFile(draftPath, "utf8"), draft);
        for (const [path, text] of originals) {
          assert.equal(await readFile(path, "utf8"), text);
        }
        assert.deepEqual(await readdir(dir), before);
        assert.deepEqual((await readdir(join(outDir, ".clarissimi"))).sort(), [
          "contributors.json",
          "static",
        ]);
        if (aliasKind.includes("symlink")) {
          assert.equal((await lstat(configPath)).isSymbolicLink(), true);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}
