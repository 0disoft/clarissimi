import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeTextFilesAtomically } from "../dist/io.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-atomic-write-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("atomic writes remove partially written temporary files without replacing existing outputs", async () => {
  await withTempDir(async (dir) => {
    const derived = join(dir, "derived.json");
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(derived, "original derived output\n");
    await writeFile(ledger, "original canonical ledger\n");
    const writeFailure = Object.assign(new Error("Disk full after a partial write."), {
      code: "ENOSPC",
    });
    let writes = 0;

    await assert.rejects(
      () =>
        writeTextFilesAtomically(
          [
            { path: derived, value: "next derived output" },
            { path: ledger, value: "next ledger generation" },
          ],
          ledger,
          {
            writeFile: async (path, value, options) => {
              writes += 1;
              if (writes === 2) {
                await writeFile(path, value.slice(0, 4), options);
                throw writeFailure;
              }
              return writeFile(path, value, options);
            },
          },
        ),
      (error) => error === writeFailure,
    );
    assert.equal(await readFile(derived, "utf8"), "original derived output\n");
    assert.equal(await readFile(ledger, "utf8"), "original canonical ledger\n");
    assert.deepEqual((await readdir(dir)).sort(), ["derived.json", "ledger.jsonl"]);
  });
});

test("atomic cleanup preserves a temporary path already owned by another writer", async () => {
  await withTempDir(async (dir) => {
    const derived = join(dir, "derived.json");
    const ledger = join(dir, "ledger.jsonl");
    let writes = 0;
    let collisionPath;

    await assert.rejects(
      () =>
        writeTextFilesAtomically(
          [
            { path: derived, value: "derived output" },
            { path: ledger, value: "canonical ledger" },
          ],
          ledger,
          {
            writeFile: async (path, value, options) => {
              writes += 1;
              if (writes === 2) {
                collisionPath = path;
                await writeFile(path, "another writer's file", { flag: "wx" });
              }
              return writeFile(path, value, options);
            },
          },
        ),
      (error) => error.code === "EEXIST",
    );
    assert.equal(await readFile(collisionPath, "utf8"), "another writer's file");
    assert.equal((await readdir(dir)).length, 1);
  });
});
