import assert from "node:assert/strict";
import {
  lstat,
  chmod,
  copyFile,
  stat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { writeTextFilesAtomically } from "../dist/io.js";

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-atomic-write-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

for (const failedDestination of ["second.json", "ledger.jsonl"]) {
  test(`atomic writes restore replaced outputs when ${failedDestination} rename fails`, async () => {
    await withTempDir(async (dir) => {
      const first = join(dir, "first.json");
      const second = join(dir, "second.json");
      const ledger = join(dir, "ledger.jsonl");
      await writeFile(first, "previous first\n");
      await writeFile(second, "previous second\n");
      await writeFile(ledger, "previous ledger\n");
      const failure = new Error("Injected later replacement failure.");
      let failed = false;
      await assert.rejects(
        writeTextFilesAtomically(
          [
            { path: first, value: "next first\n" },
            { path: second, value: "next second\n" },
            { path: ledger, value: "next ledger\n" },
          ],
          ledger,
          {
            rename: async (from, to) => {
              if (!failed && to === join(dir, failedDestination)) {
                failed = true;
                throw failure;
              }
              await rename(from, to);
            },
          },
        ),
        (error) => error === failure,
      );
      assert.equal(await readFile(first, "utf8"), "previous first\n");
      assert.equal(await readFile(second, "utf8"), "previous second\n");
      assert.equal(await readFile(ledger, "utf8"), "previous ledger\n");
      assert.deepEqual((await readdir(dir)).sort(), ["first.json", "ledger.jsonl", "second.json"]);
    });
  });
}

test("atomic writes remove newly created outputs if a later replacement fails", async () => {
  await withTempDir(async (dir) => {
    const fresh = join(dir, "fresh.json");
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(ledger, "previous ledger\n");
    const failure = new Error("Injected ledger replacement failure.");
    await assert.rejects(
      writeTextFilesAtomically(
        [
          { path: fresh, value: "new output\n" },
          { path: ledger, value: "next ledger\n" },
        ],
        ledger,
        {
          rename: async (from, to) => {
            if (to === ledger) throw failure;
            await rename(from, to);
          },
        },
      ),
      (error) => error === failure,
    );
    assert.deepEqual(await readdir(dir), ["ledger.jsonl"]);
    assert.equal(await readFile(ledger, "utf8"), "previous ledger\n");
  });
});

test("recovery copy failure preserves originals and removes partial preparation", async () => {
  await withTempDir(async (dir) => {
    const derived = join(dir, "derived.json");
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(derived, "original output\n");
    await writeFile(ledger, "original ledger\n");
    const failure = new Error("Injected recovery copy failure.");
    let copies = 0;
    await assert.rejects(
      writeTextFilesAtomically(
        [
          { path: derived, value: "next output\n" },
          { path: ledger, value: "next ledger\n" },
        ],
        ledger,
        {
          copyFile: async (from, to, flags) => {
            copies++;
            if (copies === 2) {
              await writeFile(to, "partial copy");
              throw failure;
            }
            await copyFile(from, to, flags);
          },
        },
      ),
      (error) => error === failure,
    );
    assert.equal(await readFile(derived, "utf8"), "original output\n");
    assert.equal(await readFile(ledger, "utf8"), "original ledger\n");
    assert.deepEqual((await readdir(dir)).sort(), ["derived.json", "ledger.jsonl"]);
  });
});

test("failed rollback retains the prior file and continues restoring other outputs", async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, "first.json");
    const second = join(dir, "second.json");
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(first, "previous first\n");
    await writeFile(second, "previous second\n");
    await writeFile(ledger, "previous ledger\n");
    const failure = new Error("Injected commit failure.");
    const recoveryFailure = new Error("Injected recovery failure.");
    let retained;
    await assert.rejects(
      writeTextFilesAtomically(
        [
          { path: first, value: "next first\n" },
          { path: second, value: "next second\n" },
          { path: ledger, value: "next ledger\n" },
        ],
        ledger,
        {
          rename: async (from, to) => {
            if (to === ledger) throw failure;
            if (to === second && from.endsWith(".clarissimi-backup")) {
              retained = from;
              throw recoveryFailure;
            }
            await rename(from, to);
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [failure, recoveryFailure]);
        assert.ok(error.message.includes(retained));
        return true;
      },
    );
    assert.equal(await readFile(first, "utf8"), "previous first\n");
    assert.equal(await readFile(second, "utf8"), "next second\n");
    assert.equal(await readFile(ledger, "utf8"), "previous ledger\n");
    assert.equal(await readFile(retained, "utf8"), "previous second\n");
    const names = await readdir(dir);
    assert.equal(names.filter((name) => name.endsWith(".clarissimi-backup")).length, 1);
    assert.equal(names.filter((name) => name.endsWith(".clarissimi-tmp")).length, 0);
  });
});

test("recovery copy collisions leave another writer's file intact", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(ledger, "previous ledger\n");
    let collision;
    await assert.rejects(
      writeTextFilesAtomically([{ path: ledger, value: "next ledger\n" }], ledger, {
        copyFile: async (_from, to) => {
          collision = to;
          await writeFile(to, "another writer's file", { flag: "wx" });
          throw Object.assign(new Error("Injected collision."), { code: "EEXIST" });
        },
      }),
      (error) => error.code === "EEXIST",
    );
    assert.equal(await readFile(ledger, "utf8"), "previous ledger\n");
    assert.equal(await readFile(collision, "utf8"), "another writer's file");
    assert.equal((await readdir(dir)).length, 2);
  });
});

test("atomic writes keep a symlinked ledger as the final commit point", async (context) => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    const alias = join(dir, "ledger-alias.jsonl");
    const derived = join(dir, "derived.json");
    await writeFile(ledger, "previous ledger\n");
    await writeFile(derived, "previous derived output\n");
    try {
      await symlink(ledger, alias, "file");
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        context.skip("File symlinks require Windows developer mode or symlink privileges.");
        return;
      }
      throw error;
    }
    const before = await readdir(dir);
    const failure = new Error("Derived replacement failed before ledger commit.");
    await assert.rejects(
      () =>
        writeTextFilesAtomically(
          [
            { path: alias, value: "next ledger\n" },
            { path: derived, value: "next output\n" },
          ],
          alias,
          {
            rename: async (from, to) => {
              if (to === derived) {
                throw failure;
              }
              return rename(from, to);
            },
          },
        ),
      (error) => error === failure,
    );
    assert.equal(await readFile(ledger, "utf8"), "previous ledger\n");
    assert.equal(await readFile(derived, "utf8"), "previous derived output\n");
    assert.equal((await lstat(alias)).isSymbolicLink(), true);
    assert.deepEqual(await readdir(dir), before);
  });
});

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

for (const failureStage of ["write", "rename"]) {
  test(`atomic ${failureStage} failure survives cleanup failure and waits for remaining cleanup`, async () => {
    await withTempDir(async (dir) => {
      const derived = join(dir, "derived.json");
      const ledger = join(dir, "ledger.jsonl");
      await writeFile(derived, "original derived output\n");
      await writeFile(ledger, "original canonical ledger\n");
      const originalFailure = new Error(`Injected ${failureStage} failure.`);
      const cleanupFailure = new Error("Injected temporary file cleanup failure.");
      let writes = 0;
      const cleanupPaths = [];
      let remainingCleanupFinished = false;

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
                await writeFile(path, value, options);
                if (failureStage === "write" && writes === 2) {
                  throw originalFailure;
                }
              },
              rename: async () => {
                throw originalFailure;
              },
              rm: async (path, options) => {
                cleanupPaths.push(path);
                if (cleanupPaths.length === 1) {
                  throw cleanupFailure;
                }
                await delay(20);
                await rm(path, options);
                remainingCleanupFinished = true;
              },
            },
          ),
        (error) => error === originalFailure,
      );

      assert.equal(remainingCleanupFinished, true);
      assert.equal(cleanupPaths.length, failureStage === "rename" ? 4 : 2);
      assert.equal(await readFile(derived, "utf8"), "original derived output\n");
      assert.equal(await readFile(ledger, "utf8"), "original canonical ledger\n");
      assert.equal(
        (await readdir(dir)).filter((name) => name.endsWith(".clarissimi-tmp")).length,
        1,
      );
    });
  });
}

test("atomic writes report a cleanup failure when replacement succeeded", async () => {
  await withTempDir(async (dir) => {
    const ledger = join(dir, "ledger.jsonl");
    const cleanupFailure = new Error("Injected cleanup failure after replacement.");
    await assert.rejects(
      () =>
        writeTextFilesAtomically([{ path: ledger, value: "next ledger generation" }], ledger, {
          rm: async () => {
            throw cleanupFailure;
          },
        }),
      (error) => error === cleanupFailure,
    );
    assert.equal(await readFile(ledger, "utf8"), "next ledger generation");
  });
});

test("atomic replacement restores existing access bits before rename and keeps new files private", async () => {
  await withTempDir(async (dir) => {
    const existing = join(dir, "index.html");
    const fresh = join(dir, "new-ledger.jsonl");
    await writeFile(existing, "old page");
    const previousMode = (await stat(existing)).mode & 0o777;
    const modes = [];
    await writeTextFilesAtomically(
      [
        { path: existing, value: "next page" },
        { path: fresh, value: "new ledger" },
      ],
      fresh,
      {
        writeFile: async (path, value, options) => {
          assert.equal(options.mode, 0o600);
          return writeFile(path, value, options);
        },
        chmod: async (path, mode) => {
          modes.push(mode);
          assert.equal(await readFile(path, "utf8"), "next page");
          await chmod(path, mode);
        },
        rename: async (from, to) => {
          if (to === existing) assert.deepEqual(modes, [previousMode]);
          return rename(from, to);
        },
      },
    );
    assert.deepEqual(modes, [previousMode]);
    assert.equal((await stat(existing)).mode & 0o777, previousMode);
    assert.equal(await readFile(existing, "utf8"), "next page");
    assert.equal(await readFile(fresh, "utf8"), "new ledger");
  });
});
for (const mode of [0o644, 0o640, 0o600, 0o444]) {
  test(
    `POSIX atomic replacement preserves ${mode.toString(8)} even with a restrictive umask`,
    { skip: process.platform === "win32" },
    async () => {
      await withTempDir(async (dir) => {
        const page = join(dir, "index.html");
        const fresh = join(dir, "new-ledger.jsonl");
        await writeFile(page, "old page");
        await chmod(page, mode);
        const previousUmask = process.umask(0o077);
        try {
          await writeTextFilesAtomically(
            [
              { path: page, value: "next page" },
              { path: fresh, value: "new ledger" },
            ],
            fresh,
          );
        } finally {
          process.umask(previousUmask);
        }
        assert.equal((await stat(page)).mode & 0o777, mode);
        assert.equal((await stat(fresh)).mode & 0o777, 0o600);
        assert.equal(await readFile(page, "utf8"), "next page");
      });
    },
  );
}
test("chmod failure preserves every original output and removes staged files", async () => {
  await withTempDir(async (dir) => {
    const page = join(dir, "index.html");
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(page, "old page");
    await writeFile(ledger, "old ledger");
    const failure = new Error("Permission update failed.");
    let modes = 0;
    await assert.rejects(
      writeTextFilesAtomically(
        [
          { path: page, value: "next page" },
          { path: ledger, value: "next ledger" },
        ],
        ledger,
        {
          chmod: async (path, mode) => {
            modes++;
            if (modes === 2) throw failure;
            return chmod(path, mode);
          },
        },
      ),
      (error) => error === failure,
    );
    assert.equal(await readFile(page, "utf8"), "old page");
    assert.equal(await readFile(ledger, "utf8"), "old ledger");
    assert.deepEqual((await readdir(dir)).sort(), ["index.html", "ledger.jsonl"]);
  });
});
