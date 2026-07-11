import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ASSESSMENT_SCHEMA_VERSION,
  validateContributionAssessment,
} from "../packages/schemas/dist/index.js";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultManifestPath = "fixtures/migrations/manifest.json";
const manifestSchemaVersion = "clarissimi.migration-manifest/v1";

export async function runMigrationCheck(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const manifestPath = options.manifestPath ?? defaultManifestPath;
  const manifest = JSON.parse(await readFile(join(repoRoot, manifestPath), "utf8"));
  const issues = await validateMigrationManifest(repoRoot, manifest);

  if (issues.length > 0) {
    throw new Error(`migration compatibility check failed:\n${issues.join("\n")}`);
  }

  return {
    currentSchemaVersion: manifest.currentSchemaVersion,
    knownVersionCount: manifest.knownVersions.length,
    migrationCount: manifest.migrations.length,
  };
}

export async function validateMigrationManifest(repoRoot, manifest) {
  const issues = validateManifestShape(manifest);
  if (issues.length > 0) {
    return issues;
  }

  if (manifest.currentSchemaVersion !== ASSESSMENT_SCHEMA_VERSION) {
    issues.push(`manifest currentSchemaVersion must match ${ASSESSMENT_SCHEMA_VERSION}.`);
  }

  if (manifest.knownVersions.at(-1) !== manifest.currentSchemaVersion) {
    issues.push("manifest currentSchemaVersion must be the last knownVersions entry.");
  }

  const migrationEdges = new Set(manifest.migrations.map(({ from, to }) => `${from}->${to}`));
  for (let index = 1; index < manifest.knownVersions.length; index += 1) {
    const edge = `${manifest.knownVersions[index - 1]}->${manifest.knownVersions[index]}`;
    if (!migrationEdges.has(edge)) {
      issues.push(`manifest migrations must include ${edge}.`);
    }
  }

  for (const version of manifest.knownVersions) {
    const fixturePath = manifest.acceptedFixtures[version];
    if (typeof fixturePath !== "string" || fixturePath.length === 0) {
      issues.push(`manifest acceptedFixtures must include ${version}.`);
      continue;
    }

    const fixture = await readJsonFixture(repoRoot, fixturePath, issues);
    if (fixture === undefined) {
      continue;
    }

    if (fixture.schemaVersion !== version) {
      issues.push(`${fixturePath} schemaVersion must be ${version}.`);
    }

    if (version === ASSESSMENT_SCHEMA_VERSION) {
      const result = validateContributionAssessment(fixture);
      if (!result.ok) {
        issues.push(`${fixturePath} must pass current assessment validation.`);
      }
    }
  }

  const unknownFixture = await readJsonFixture(
    repoRoot,
    manifest.rejectedUnknownVersionFixture,
    issues,
  );
  if (unknownFixture !== undefined) {
    if (manifest.knownVersions.includes(unknownFixture.schemaVersion)) {
      issues.push("rejected unknown-version fixture must use an unregistered schemaVersion.");
    }

    const result = validateContributionAssessment(unknownFixture);
    if (result.ok || !result.issues.some((issue) => issue.path === "$.schemaVersion")) {
      issues.push("unknown-version fixture must fail current validation at $.schemaVersion.");
    }
  }

  return issues;
}

function validateManifestShape(manifest) {
  const issues = [];
  if (manifest?.schemaVersion !== manifestSchemaVersion) {
    issues.push(`manifest schemaVersion must be ${manifestSchemaVersion}.`);
  }
  if (!Array.isArray(manifest?.knownVersions) || manifest.knownVersions.length === 0) {
    issues.push("manifest knownVersions must be a non-empty array.");
  }
  if (typeof manifest?.currentSchemaVersion !== "string") {
    issues.push("manifest currentSchemaVersion must be a string.");
  }
  if (
    manifest?.acceptedFixtures === null ||
    typeof manifest?.acceptedFixtures !== "object" ||
    Array.isArray(manifest?.acceptedFixtures)
  ) {
    issues.push("manifest acceptedFixtures must be an object.");
  }
  if (typeof manifest?.rejectedUnknownVersionFixture !== "string") {
    issues.push("manifest rejectedUnknownVersionFixture must be a string.");
  }
  if (!Array.isArray(manifest?.migrations)) {
    issues.push("manifest migrations must be an array.");
  }
  return issues;
}

async function readJsonFixture(repoRoot, fixturePath, issues) {
  try {
    return JSON.parse(await readFile(join(repoRoot, fixturePath), "utf8"));
  } catch (error) {
    issues.push(`${fixturePath} must be readable JSON: ${error.message}`);
    return undefined;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runMigrationCheck();
  console.log(
    `migration compatibility passed: current=${result.currentSchemaVersion} known=${result.knownVersionCount} migrations=${result.migrationCount}`,
  );
}
