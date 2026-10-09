import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

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

test("analytics accepts JSON before or after its subcommand", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-flag-order-"));
  try {
    const options = ["--as-of", "2026-10-09T00:00:00.000Z", "--window-days", "30"];
    const expected = await run(["analytics", "recent-share", ...options, "--json"], dir);
    assert.equal(expected.exitCode, 0);
    for (const argv of [
      ["analytics", "--json", "recent-share", ...options],
      ["analytics", ...options, "--json", "recent-share"],
      ["analytics", "--json", ...options, "recent-share"],
    ]) {
      assert.deepEqual(await run(argv, dir), expected);
    }
    assert.equal(JSON.parse(expected.stdout).analytics.window.windowDays, 30);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("completion accepts help before or after its shell selector", async () => {
  const dir = tmpdir();
  const expected = await run(["completion", "powershell", "--help"], dir);
  assert.equal(expected.exitCode, 0);
  assert.match(expected.stdout, /shell/);
  assert.deepEqual(await run(["completion", "--help", "powershell"], dir), expected);
});

test("boolean flags keep unexpected positional arguments visible", async () => {
  for (const argv of [
    ["--help", "unexpected"],
    ["recognize", "--help", "unexpected"],
    ["validate-config", "--json", "unexpected"],
  ]) {
    const result = await run(argv, tmpdir());
    assert.equal(result.exitCode, 1);
    const message = argv.includes("--json") ? JSON.parse(result.stdout).message : result.stderr;
    assert.match(message, /does not accept positional arguments: unexpected/);
  }
});
