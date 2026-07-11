import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runMigrationCheck, validateMigrationManifest } from "../migration-check.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test("migration check accepts the committed v1 compatibility contract", async () => {
  const result = await runMigrationCheck({ repoRoot });

  assert.deepEqual(result, {
    currentSchemaVersion: "clarissimi.assessment/v1",
    knownVersionCount: 1,
    migrationCount: 0,
  });
});

test("migration check requires an explicit edge when a later version is registered", async () => {
  const manifest = await readManifest();
  manifest.currentSchemaVersion = "clarissimi.assessment/v2";
  manifest.knownVersions.push("clarissimi.assessment/v2");
  manifest.acceptedFixtures["clarissimi.assessment/v2"] = "fixtures/migrations/assessment-v1.json";

  const issues = await validateMigrationManifest(repoRoot, manifest);

  assert.equal(
    issues.includes(
      "manifest migrations must include clarissimi.assessment/v1->clarissimi.assessment/v2.",
    ),
    true,
  );
});

test("migration check requires the negative fixture to use an unknown version", async () => {
  const manifest = await readManifest();
  manifest.rejectedUnknownVersionFixture = "fixtures/migrations/assessment-v1.json";

  const issues = await validateMigrationManifest(repoRoot, manifest);

  assert.equal(
    issues.includes("rejected unknown-version fixture must use an unregistered schemaVersion."),
    true,
  );
  assert.equal(
    issues.includes("unknown-version fixture must fail current validation at $.schemaVersion."),
    true,
  );
});

async function readManifest() {
  return JSON.parse(await readFile(join(repoRoot, "fixtures/migrations/manifest.json"), "utf8"));
}
