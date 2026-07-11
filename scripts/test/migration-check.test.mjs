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

test("migration check executes every registered migration and validates the final shape", async () => {
  const manifest = await readManifest();
  manifest.currentSchemaVersion = "clarissimi.assessment/v3";
  manifest.knownVersions.push("clarissimi.assessment/v2", "clarissimi.assessment/v3");
  manifest.acceptedFixtures["clarissimi.assessment/v2"] = "fixtures/migrations/assessment-v1.json";
  manifest.acceptedFixtures["clarissimi.assessment/v3"] = "fixtures/migrations/assessment-v1.json";
  manifest.migrations.push({
    from: "clarissimi.assessment/v1",
    to: "clarissimi.assessment/v2",
    module: "scripts/migrations/assessment-v1-to-v2.mjs",
  });
  manifest.migrations.push({
    from: "clarissimi.assessment/v2",
    to: "clarissimi.assessment/v3",
    module: "scripts/migrations/assessment-v2-to-v3.mjs",
  });

  const calls = [];
  const issues = await validateMigrationManifest(repoRoot, manifest, {
    currentSchemaVersion: "clarissimi.assessment/v3",
    loadMigration: async (_root, modulePath) => ({
      migrate: (value) => {
        calls.push(modulePath);
        const schemaVersion = modulePath.includes("v1-to-v2")
          ? "clarissimi.assessment/v2"
          : "clarissimi.assessment/v3";
        return { ...value, schemaVersion, migrated: true };
      },
    }),
    validateCurrentAssessment: (value) =>
      value.schemaVersion === "clarissimi.assessment/v3" && value.migrated === true
        ? { ok: true, value }
        : { ok: false, issues: [{ path: "$.schemaVersion" }] },
  });

  assert.deepEqual(issues, [
    "fixtures/migrations/assessment-v1.json schemaVersion must be clarissimi.assessment/v2.",
    "fixtures/migrations/assessment-v1.json schemaVersion must be clarissimi.assessment/v3.",
  ]);
  assert.deepEqual(calls, [
    "scripts/migrations/assessment-v1-to-v2.mjs",
    "scripts/migrations/assessment-v1-to-v2.mjs",
    "scripts/migrations/assessment-v2-to-v3.mjs",
    "scripts/migrations/assessment-v2-to-v3.mjs",
  ]);
});

test("migration check rejects migration modules outside the repository", async () => {
  const manifest = await readManifest();
  manifest.currentSchemaVersion = "clarissimi.assessment/v2";
  manifest.knownVersions.push("clarissimi.assessment/v2");
  manifest.acceptedFixtures["clarissimi.assessment/v2"] = "fixtures/migrations/assessment-v1.json";
  manifest.migrations.push({
    from: "clarissimi.assessment/v1",
    to: "clarissimi.assessment/v2",
    module: "../outside.mjs",
  });

  let loadCount = 0;
  const issues = await validateMigrationManifest(repoRoot, manifest, {
    currentSchemaVersion: "clarissimi.assessment/v2",
    loadMigration: async () => {
      loadCount += 1;
      return { migrate: (value) => value };
    },
    validateCurrentAssessment: () => ({ ok: false, issues: [{ path: "$.schemaVersion" }] }),
  });

  assert.equal(
    issues.includes(
      "manifest migration clarissimi.assessment/v1->clarissimi.assessment/v2 module must stay inside the repository.",
    ),
    true,
  );
  assert.equal(loadCount, 0);
});

test("migration check rejects non-deterministic migration results", async () => {
  const manifest = await readManifest();
  manifest.currentSchemaVersion = "clarissimi.assessment/v2";
  manifest.knownVersions.push("clarissimi.assessment/v2");
  manifest.acceptedFixtures["clarissimi.assessment/v2"] = "fixtures/migrations/assessment-v1.json";
  manifest.migrations.push({
    from: "clarissimi.assessment/v1",
    to: "clarissimi.assessment/v2",
    module: "scripts/migrations/assessment-v1-to-v2.mjs",
  });

  let sequence = 0;
  const issues = await validateMigrationManifest(repoRoot, manifest, {
    currentSchemaVersion: "clarissimi.assessment/v2",
    loadMigration: async () => ({
      migrate: (value) => ({
        ...value,
        schemaVersion: "clarissimi.assessment/v2",
        sequence: (sequence += 1),
      }),
    }),
    validateCurrentAssessment: (value) =>
      value.schemaVersion === "clarissimi.assessment/v2"
        ? { ok: true, value }
        : { ok: false, issues: [{ path: "$.schemaVersion" }] },
  });

  assert.equal(
    issues.includes(
      "scripts/migrations/assessment-v1-to-v2.mjs must migrate clarissimi.assessment/v1 deterministically.",
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
