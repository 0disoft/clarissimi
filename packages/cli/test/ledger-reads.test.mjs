import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

const fixture = JSON.parse(
  await fs.readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
);

for (const command of ["rebuild", "render-page"]) {
  const expectedReads = command === "rebuild" ? 2 : 1;
  test(`${command} limits source ledger reads to ${expectedReads}`, async (t) => {
    const directory = await fs.mkdtemp(join(tmpdir(), "clarissimi-ledger-reads-"));
    const ledger = join(directory, ".clarissimi", "contributions.jsonl");
    const records = Array.from({ length: 1_000 }, (_, index) => ({
      ...fixture,
      source: { ...fixture.source, pullRequestNumber: index + 1 },
    }));
    const contents = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
    let readMock;
    try {
      await fs.mkdir(join(directory, ".clarissimi"));
      await fs.writeFile(ledger, contents, "utf8");
      const originalReadFile = fs.readFile;
      const reads = [];
      const pathKey = (path) =>
        process.platform === "win32" ? resolve(String(path)).toLowerCase() : resolve(String(path));
      readMock = t.mock.method(fs, "readFile", async (path, ...options) => {
        const text = await originalReadFile(path, ...options);
        if (pathKey(path) === pathKey(ledger)) {
          const locked = await fs.stat(`${ledger}.lock`).then(
            () => true,
            () => false,
          );
          reads.push({ bytes: Buffer.byteLength(text), locked });
        }
        return text;
      });
      syncBuiltinESMExports();
      let stderr = "";
      const exitCode = await runCli(
        [command, "--ledger", ledger, "--out-dir", directory, "--json"],
        { cwd: directory, stdout: () => {}, stderr: (text) => (stderr += text) },
      );
      assert.equal(exitCode, 0, stderr);
      assert.equal(
        reads.length,
        expectedReads,
        `${command}: ${reads.length} full reads, ${reads.reduce((sum, read) => sum + read.bytes, 0)} bytes for a ${Buffer.byteLength(contents)}-byte ledger`,
      );
      assert.equal(reads[0].bytes, Buffer.byteLength(contents));
      if (command === "rebuild") assert.equal(reads.at(-1).locked, true);
      await assert.rejects(fs.stat(`${ledger}.lock`), { code: "ENOENT" });
    } finally {
      readMock?.mock.restore();
      syncBuiltinESMExports();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}
