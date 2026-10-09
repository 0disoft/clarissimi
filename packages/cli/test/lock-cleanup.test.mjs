import assert from "node:assert/strict";
import { mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RendererValidationError } from "../../renderers/dist/index.js";
import { withFileLock } from "../dist/io.js";
import { CliLedgerValidationError } from "../dist/ledger.js";

for (const cleanupStage of ["close", "read-owner", "changed-owner"]) {
  for (const taskFails of [false, true]) {
    test(`file lock ${cleanupStage} failure ${taskFails ? "preserves the original task error" : "is reported after a successful task"}`, async () => {
      const dir = await mkdtemp(join(tmpdir(), "clarissimi-lock-cleanup-"));
      try {
        const lock = join(dir, "ledger.lock");
        const taskFailure = new CliLedgerValidationError(
          new RendererValidationError("Original ledger validation failure.", []),
        );
        const closeFailure = new Error("Injected lock close failure.");
        let handleClosed = false;
        const options =
          cleanupStage === "close"
            ? {
                openFile: async (...args) => {
                  const handle = await open(...args);
                  return {
                    writeFile: (...writeArgs) => handle.writeFile(...writeArgs),
                    close: async () => {
                      await handle.close();
                      handleClosed = true;
                      throw closeFailure;
                    },
                  };
                },
              }
            : {};
        await assert.rejects(
          withFileLock(
            lock,
            async () => {
              if (cleanupStage !== "close") {
                await rm(lock);
                if (cleanupStage === "changed-owner") {
                  await writeFile(lock, "replacement owner\n");
                }
              }
              if (taskFails) {
                throw taskFailure;
              }
              return "task completed";
            },
            options,
          ),
          (error) => {
            if (taskFails) {
              assert.equal(error, taskFailure);
              assert.equal(error instanceof CliLedgerValidationError, true);
            } else if (cleanupStage === "close") {
              assert.equal(error, closeFailure);
            } else if (cleanupStage === "read-owner") {
              assert.equal(error.code, "ENOENT");
            } else {
              assert.match(error.message, /ownership changed/);
            }
            return true;
          },
        );
        if (cleanupStage === "close") {
          assert.equal(handleClosed, true);
          assert.equal(JSON.parse(await readFile(lock, "utf8")).pid, process.pid);
        } else if (cleanupStage === "changed-owner") {
          assert.equal(await readFile(lock, "utf8"), "replacement owner\n");
        } else {
          assert.deepEqual(await readdir(dir), []);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}
