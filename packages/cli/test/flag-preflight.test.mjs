import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-flag-preflight-"));
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

async function snapshot(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      files.push(...(await snapshot(path, name + "/")));
    } else {
      files.push([
        name,
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      ]);
    }
  }
  return files.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

for (const command of [
  ["stage-draft", "--draft", "pending.json"],
  ["approve-draft", "--draft", "pending.json"],
  ["import-draft", "--draft", "approved.json", "--allow-legacy-approval", "--out-dir", "."],
  ["rebuild", "--out-dir", "."],
  ["render-page", "--out-dir", "."],
]) {
  test(`${command[0]} rejects malformed JSON options before changing files`, async () => {
    await withTempDir(async (dir) => {
      const approved = JSON.parse(
        await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
      );
      await writeFile(join(dir, "approved.json"), JSON.stringify(approved));
      await writeFile(
        join(dir, "pending.json"),
        JSON.stringify({ ...approved, maintainerApprovalStatus: "draft" }),
      );
      await mkdir(join(dir, ".clarissimi"));
      await writeFile(join(dir, ".clarissimi", "contributions.jsonl"), "\n");
      await writeFile(join(dir, "CONTRIBUTORS.md"), "existing contributor history\n");
      await writeFile(join(dir, "index.html"), "existing contributor page\n");
      const before = await snapshot(dir);

      const result = await run([...command, "--json=false"], dir);

      assert.equal(result.exitCode, 1, result.stdout + result.stderr);
      assert.equal(result.stderr, "--json does not accept a value.\n");
      assert.deepEqual(await snapshot(dir), before);
    });
  });
}

test("missing values on optional flags fail before loading executable config", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      join(dir, "clarissimi.config.ts"),
      [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync(new URL("./config-ran.txt", import.meta.url), "loaded");',
        "export default {};",
      ].join("\n"),
    );
    const input = await readFile(
      new URL("../../../fixtures/merged-pr-basic.json", import.meta.url),
      "utf8",
    );
    await writeFile(join(dir, "fixture.json"), input);
    const before = await snapshot(dir);
    const result = await run(
      ["recognize", "--fixture", "fixture.json", "--provider-model", "--json"],
      dir,
    );
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).message, /--provider-model requires a value/);
    assert.deepEqual(await snapshot(dir), before);
  });
});

test("global help rejects assigned values instead of silently succeeding", async () => {
  await withTempDir(async (dir) => {
    const result = await run(["--help=false"], dir);
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "--help does not accept a value.\n");
  });
});

for (const flag of [
  "provider",
  "provider-thinking",
  "provider-endpoint-trust",
  "mode",
  "markdown-summary",
]) {
  test(`unsupported --${flag} fails before config execution, including help`, async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, "clarissimi.config.ts"),
        [
          'import { writeFileSync } from "node:fs";',
          'writeFileSync(new URL("./config-ran.txt", import.meta.url), "loaded");',
          "export default {};",
        ].join("\n"),
      );
      const fixture = JSON.parse(
        await readFile(new URL("../../../fixtures/merged-pr-basic.json", import.meta.url), "utf8"),
      );
      fixture.maintainerApprovalStatus = "draft";
      await writeFile(join(dir, "fixture.json"), JSON.stringify(fixture));
      const before = await snapshot(dir);
      for (const extra of [[], ["--help"]]) {
        const result = await run(
          [
            "recognize",
            "--fixture",
            "fixture.json",
            `--${flag}`,
            "UNSUPPORTED_FLAG_CANARY",
            ...extra,
            "--json",
          ],
          dir,
        );
        assert.equal(result.exitCode, 1, result.stdout + result.stderr);
        assert.equal(result.stderr, "");
        const output = JSON.parse(result.stdout);
        assert.equal(output.ok, false);
        assert.ok(output.message.includes(`--${flag}`));
        assert.ok(output.message.includes("Allowed values:"));
        assert.ok(!result.stdout.includes("UNSUPPORTED_FLAG_CANARY"));
        assert.deepEqual(await snapshot(dir), before);
      }
    });
  });
}
