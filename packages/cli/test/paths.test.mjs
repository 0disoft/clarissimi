import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { pathsReferToSameFile } from "../dist/paths.js";

test("file identity keeps distinct 64-bit inode values separate", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-path-identity-"));
  const left = join(dir, "left.json");
  const right = join(dir, "right.json");
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.all([writeFile(left, "left"), writeFile(right, "right")]);
  const first = 9_007_199_254_740_992n;
  const second = first + 1n;
  assert.equal(Number(first), Number(second));
  const realStat = fs.promises.stat;
  t.mock.method(fs.promises, "stat", async (path, options) => {
    const ino = path === left ? first : second;
    const result = await realStat(path, options);
    return Object.assign(result, options?.bigint ? { dev: 1n, ino } : { dev: 1, ino: Number(ino) });
  });
  syncBuiltinESMExports();
  assert.equal(await pathsReferToSameFile(left, right), false);
});
