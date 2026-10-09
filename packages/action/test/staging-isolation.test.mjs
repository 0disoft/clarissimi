import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withActionStaging } from "../dist/staging-directory.js";
import { stageProposalRecognitionOutputs } from "../dist/staging.js";

async function temp(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-stage-isolation-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("staging refuses checkout overlap and junctions before writing", () =>
  temp(async (dir) => {
    const repositoryDir = join(dir, "repo");
    await mkdir(repositoryDir);
    await writeFile(join(repositoryDir, "CONTRIBUTORS.md"), "keep checkout");
    let called = false;
    const task = async () => {
      called = true;
    };
    await assert.rejects(
      withActionStaging({ repositoryDir, stagingDir: repositoryDir }, task),
      /overlap/,
    );
    const external = join(dir, "external");
    await mkdir(external);
    await writeFile(join(external, "contributors.json"), "keep external");
    const alias = join(dir, "alias");
    await symlink(external, alias, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      withActionStaging({ repositoryDir, stagingDir: alias }, task),
      /symbolic links|junctions/,
    );
    assert.equal(called, false);
    assert.equal(await readFile(join(repositoryDir, "CONTRIBUTORS.md"), "utf8"), "keep checkout");
    assert.equal(await readFile(join(external, "contributors.json"), "utf8"), "keep external");
  }));
test("concurrent staging uses separate directories and cleans success and failure", () =>
  temp(async (dir) => {
    const repositoryDir = join(dir, "repo");
    await mkdir(repositoryDir);
    const stagingDir = join(dir, "parent");
    const paths = [];
    const results = await Promise.allSettled(
      [false, true].map((fail) =>
        withActionStaging({ repositoryDir, stagingDir }, async (input) => {
          paths.push(input.stagingDir);
          await writeFile(join(input.stagingDir, "work.txt"), "private stage");
          if (fail) throw new Error("task failed");
        }),
      ),
    );
    assert.notEqual(paths[0], paths[1]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    assert.deepEqual(await readdir(stagingDir), []);
  }));
test("low-level staging rejects existing files and linked descendants before its first output", () =>
  temp(async (dir) => {
    const record = JSON.parse(
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
    );
    const outside = join(dir, "external");
    const stage = join(dir, "stage");
    await mkdir(outside);
    await mkdir(stage);
    await writeFile(join(outside, "contributors.json"), "keep external");
    await symlink(
      outside,
      join(stage, ".clarissimi"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      stageProposalRecognitionOutputs({
        outputDir: stage,
        assessments: [record],
        redactionMatchCount: 0,
      }),
      /symbolic links|junctions/,
    );
    assert.equal(await readFile(join(outside, "contributors.json"), "utf8"), "keep external");
    await assert.rejects(readFile(join(stage, "CONTRIBUTORS.md")), { code: "ENOENT" });
    const safe = join(dir, "safe");
    await mkdir(safe);
    await writeFile(join(safe, "CONTRIBUTORS.md"), "keep staging");
    await assert.rejects(
      stageProposalRecognitionOutputs({
        outputDir: safe,
        assessments: [record],
        redactionMatchCount: 0,
      }),
      /already exists/,
    );
    assert.deepEqual(await readdir(safe), ["CONTRIBUTORS.md"]);
  }));
