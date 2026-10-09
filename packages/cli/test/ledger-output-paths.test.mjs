import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-ledger-output-"));
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

for (const [command, destination] of [
  ["rebuild", "CONTRIBUTORS.md"],
  ["rebuild", ".clarissimi/contributors.json"],
  ["rebuild", ".clarissimi/static/contributions.json"],
  ["render-page", "index.html"],
]) {
  test(`${command} preserves a ledger selected at its ${destination} output path`, async () => {
    await withTempDir(async (dir) => {
      const ledgerPath = join(dir, destination);
      await mkdir(dirname(ledgerPath), { recursive: true });
      await writeFile(ledgerPath, "\n");
      const result = await run([command, "--ledger", ledgerPath, "--out-dir", dir, "--json"], dir);
      assert.equal(result.exitCode, 1, result.stdout + result.stderr);
      assert.match(JSON.parse(result.stdout).message, /overlaps.*canonical ledger/i);
      assert.equal(await readFile(ledgerPath, "utf8"), "\n");
      if (destination === "CONTRIBUTORS.md" || destination === "index.html") {
        assert.deepEqual(await readdir(dir), [destination]);
      }
    });
  });
}

test("render-page preserves a ledger reached through a hard-linked page path", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    const page = join(dir, "index.html");
    await writeFile(ledger, "\n");
    await link(ledger, page);
    const result = await run(["render-page", "--ledger", ledger, "--out-dir", dir, "--json"], dir);
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.equal(await readFile(ledger, "utf8"), "\n");
    assert.equal(await readFile(page, "utf8"), "\n");
  });
});

test("rebuild rejects a derived output directory alias before writing", async () => {
  await withTempDir(async (dir) => {
    const output = join(dir, "output");
    const alias = join(dir, "alias");
    await mkdir(output);
    await symlink(output, alias, process.platform === "win32" ? "junction" : "dir");
    const ledger = join(output, "CONTRIBUTORS.md");
    await writeFile(ledger, "\n");
    const result = await run(["rebuild", "--ledger", ledger, "--out-dir", alias, "--json"], dir);
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.equal(await readFile(ledger, "utf8"), "\n");
    assert.deepEqual(await readdir(output), ["CONTRIBUTORS.md"]);
  });
});

test("import-draft rejects a derived output collision before appending the ledger", async () => {
  await withTempDir(async (dir) => {
    const draftPath = join(dir, "draft.json");
    await writeFile(
      draftPath,
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url)),
    );
    const ledger = join(dir, "CONTRIBUTORS.md");
    await writeFile(ledger, "\n");
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
        "--json",
      ],
      dir,
    );
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.equal(await readFile(ledger, "utf8"), "\n");
    assert.deepEqual((await readdir(dir)).sort(), ["CONTRIBUTORS.md", "draft.json"]);
  });
});

test("import-draft rejects an aliased output collision before creating a new ledger", async () => {
  await withTempDir(async (dir) => {
    const output = join(dir, "output");
    const alias = join(dir, "alias");
    await mkdir(output);
    await symlink(output, alias, process.platform === "win32" ? "junction" : "dir");
    const draftPath = join(dir, "draft.json");
    await writeFile(
      draftPath,
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url)),
    );
    const result = await run(
      [
        "import-draft",
        "--draft",
        draftPath,
        "--allow-legacy-approval",
        "--ledger",
        join(output, "CONTRIBUTORS.md"),
        "--out-dir",
        alias,
        "--json",
      ],
      dir,
    );
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.deepEqual(await readdir(output), []);
  });
});
