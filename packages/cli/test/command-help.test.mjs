import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

async function run(argv, cwd = join(tmpdir(), "clarissimi-help-missing-repository")) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    cwd,
    get env() {
      throw new Error("Help must not read credentials.");
    },
    fetch: async () => {
      throw new Error("Help must not call the network.");
    },
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
}

test("command help describes only the selected command and its options", async () => {
  const result = await run(["rebuild", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /clarissimi rebuild/);
  assert.match(result.stdout, /Options:/);
  assert.match(result.stdout, /--check\s+Compare existing outputs/);
  assert.match(result.stdout, /--markdown-summary <format>/);
  assert.match(result.stdout, /none, table, gallery/);
  assert.ok(!result.stdout.includes("clarissimi recognize"));
  assert.ok(!result.stdout.includes("--provider-model"));
});

test("command help describes positional choices without requiring a selector", async () => {
  for (const [command, selector, choices] of [
    ["analytics", "subcommand", "recent-share"],
    ["completion", "shell", "bash, zsh, fish, powershell"],
  ]) {
    const result = await run([command, "--help"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Arguments:/);
    assert.ok(result.stdout.includes(`<${selector}>`));
    assert.ok(result.stdout.includes(choices));
  }
});

test("help does not hide an unknown command, including in JSON output", async () => {
  const result = await run(["rebuid", "--help"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Unknown command: rebuid\n");

  const json = await run(["rebuid", "--help", "--json"]);
  assert.equal(json.exitCode, 1);
  assert.equal(json.stderr, "");
  assert.deepEqual(JSON.parse(json.stdout), {
    ok: false,
    command: "rebuid",
    message: "Unknown command: rebuid",
  });
});

test("global help forms still print the same command overview", async () => {
  const overview = await run([]);
  assert.equal(overview.exitCode, 0);
  assert.match(overview.stdout, /Commands:/);
  for (const argv of [["--help"], ["help"], ["help", "--help"]]) {
    assert.deepEqual(await run(argv), overview);
  }
});

test("command help bypasses executable config and missing evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-command-help-"));
  try {
    await writeFile(
      join(dir, "clarissimi.config.ts"),
      'throw new Error("Help must not execute config.");\nexport default {};\n',
    );
    const result = await run(
      ["recognize", "--fixture", "missing.json", "--provider", "openai-compatible", "--help"],
      dir,
    );
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Options:/);
    assert.deepEqual(await readdir(dir), ["clarissimi.config.ts"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
