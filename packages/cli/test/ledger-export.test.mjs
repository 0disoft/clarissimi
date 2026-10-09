import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../dist/index.js";
import { withFileLock } from "../dist/io.js";

async function run(argv, cwd) {
  let stdout = "";
  const code = await runCli([...argv, "--json"], {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: () => {},
  });
  return { code, result: JSON.parse(stdout) };
}
async function fixture(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-export-"));
  try {
    const destination = join(dir, "output");
    await mkdir(join(destination, ".clarissimi"), { recursive: true });
    const record = JSON.parse(
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
    );
    await callback(dir, destination, record);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("writing rebuild preserves destination history when default input is missing", () =>
  fixture(async (dir, destination, record) => {
    const target = join(destination, ".clarissimi/contributions.jsonl");
    const before = `${JSON.stringify(record)}\n`;
    await writeFile(target, before);
    const { code } = await run(["rebuild", "--out-dir", destination], dir);
    assert.equal(code, 3);
    assert.equal(await readFile(target, "utf8"), before);
  }));
test("export rejects missing or changed destination records before writing any output", () =>
  fixture(async (dir, destination, record) => {
    const target = join(destination, ".clarissimi/contributions.jsonl");
    const before = `${JSON.stringify(record)}\n`;
    await writeFile(target, before);
    await writeFile(join(destination, "CONTRIBUTORS.md"), "keep history");
    const source = join(dir, "source.jsonl");
    for (const input of [
      "",
      `${JSON.stringify({ ...record, publicRecognitionText: "Changed recognition text." })}\n`,
    ]) {
      await writeFile(source, input);
      const { code, result } = await run(
        ["rebuild", "--ledger", source, "--out-dir", destination],
        dir,
      );
      assert.equal(code, 3);
      assert.match(result.message, /preserved/);
      assert.equal(await readFile(target, "utf8"), before);
      assert.equal(await readFile(join(destination, "CONTRIBUTORS.md"), "utf8"), "keep history");
    }
  }));
test("export waits for the destination lock and preserves concurrently added records", () =>
  fixture(async (dir, destination, record) => {
    const source = join(dir, "source.jsonl");
    const target = join(destination, ".clarissimi/contributions.jsonl");
    await writeFile(source, "");
    let pending;
    let completed = false;
    await withFileLock(`${target}.lock`, async () => {
      pending = run(["rebuild", "--ledger", source, "--out-dir", destination], dir).then(
        (value) => {
          completed = true;
          return value;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(completed, false);
      await writeFile(target, `${JSON.stringify(record)}\n`);
    });
    assert.equal((await pending).code, 3);
    assert.equal(
      JSON.parse(await readFile(target, "utf8")).source.pullRequestNumber,
      record.source.pullRequestNumber,
    );
  }));
test("empty directory export and same-ledger rebuild remain supported", () =>
  fixture(async (dir, destination, record) => {
    const source = join(dir, "source.jsonl");
    await writeFile(source, `${JSON.stringify(record)}\n`);
    assert.equal(
      (await run(["rebuild", "--ledger", source, "--out-dir", destination], dir)).code,
      0,
    );
    const target = join(destination, ".clarissimi/contributions.jsonl");
    const before = await readFile(target, "utf8");
    assert.equal((await run(["rebuild", "--out-dir", destination], destination)).code, 0);
    assert.equal(await readFile(target, "utf8"), before);
  }));
