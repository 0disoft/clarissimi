import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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
  const manifest = JSON.parse(await readFile(resolve(repoRoot, manifestPath), "utf8"));
  const issues = await validateMigrationManifest(repoRoot, manifest, options);

  if (issues.length > 0) {
    throw new Error(`migration compatibility check failed:\n${issues.join("\n")}`);
  }

  return {
    currentSchemaVersion: manifest.currentSchemaVersion,
    knownVersionCount: manifest.knownVersions.length,
    migrationCount: manifest.migrations.length,
  };
}

export async function validateMigrationManifest(repoRoot, manifest, options = {}) {
  const issues = validateManifestShape(manifest);
  if (issues.length > 0) {
    return issues;
  }

  const currentSchemaVersion = options.currentSchemaVersion ?? ASSESSMENT_SCHEMA_VERSION;
  const validateCurrentAssessment =
    options.validateCurrentAssessment ?? validateContributionAssessment;
  const loadMigration = options.loadMigration ?? loadMigrationModule;

  if (manifest.currentSchemaVersion !== currentSchemaVersion) {
    issues.push(`manifest currentSchemaVersion must match ${currentSchemaVersion}.`);
  }

  if (manifest.knownVersions.at(-1) !== manifest.currentSchemaVersion) {
    issues.push("manifest currentSchemaVersion must be the last knownVersions entry.");
  }

  validateKnownVersions(manifest, issues);
  const migrationByFrom = validateMigrationEdges(repoRoot, manifest, issues);

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
      continue;
    }

    await validateFixtureMigrationChain({
      repoRoot,
      fixture,
      fixturePath,
      startVersion: version,
      currentSchemaVersion,
      migrationByFrom,
      loadMigration,
      validateCurrentAssessment,
      issues,
    });
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

    const result = validateCurrentAssessment(unknownFixture);
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

function validateKnownVersions(manifest, issues) {
  const seen = new Set();
  for (const version of manifest.knownVersions) {
    if (typeof version !== "string" || version.length === 0) {
      issues.push("manifest knownVersions entries must be non-empty strings.");
      continue;
    }
    if (seen.has(version)) {
      issues.push(`manifest knownVersions must not repeat ${version}.`);
    }
    seen.add(version);
  }
}

function validateMigrationEdges(repoRoot, manifest, issues) {
  const expectedEdges = new Map();
  for (let index = 1; index < manifest.knownVersions.length; index += 1) {
    expectedEdges.set(manifest.knownVersions[index - 1], manifest.knownVersions[index]);
  }

  const migrationByFrom = new Map();
  for (const migration of manifest.migrations) {
    if (migration === null || typeof migration !== "object" || Array.isArray(migration)) {
      issues.push("manifest migrations entries must be objects.");
      continue;
    }

    const { from, to, module } = migration;
    if (typeof from !== "string" || typeof to !== "string") {
      issues.push("manifest migration from and to must be strings.");
      continue;
    }

    const isExpectedEdge = expectedEdges.get(from) === to;
    if (!isExpectedEdge) {
      issues.push(`manifest migration ${from}->${to} must be an adjacent knownVersions edge.`);
    }
    const isDuplicate = migrationByFrom.has(from);
    if (isDuplicate) {
      issues.push(`manifest migrations must not repeat an edge from ${from}.`);
    }

    let hasValidModule = true;
    if (typeof module !== "string" || module.length === 0) {
      issues.push(`manifest migration ${from}->${to} must declare a module.`);
      hasValidModule = false;
    } else if (!isRepoRelativePath(repoRoot, module)) {
      issues.push(`manifest migration ${from}->${to} module must stay inside the repository.`);
      hasValidModule = false;
    }

    if (isExpectedEdge && !isDuplicate && hasValidModule) {
      migrationByFrom.set(from, migration);
    }
  }

  for (const [from, to] of expectedEdges) {
    if (!migrationByFrom.has(from)) {
      issues.push(`manifest migrations must include ${from}->${to}.`);
    }
  }

  return migrationByFrom;
}

async function validateFixtureMigrationChain(options) {
  const {
    repoRoot,
    fixture,
    fixturePath,
    startVersion,
    currentSchemaVersion,
    migrationByFrom,
    loadMigration,
    validateCurrentAssessment,
    issues,
  } = options;

  let migrated = structuredClone(fixture);
  let version = startVersion;
  const visited = new Set();

  while (version !== currentSchemaVersion) {
    if (visited.has(version)) {
      issues.push(`${fixturePath} migration chain must not contain a cycle at ${version}.`);
      return;
    }
    visited.add(version);

    const migration = migrationByFrom.get(version);
    if (migration === undefined || typeof migration.module !== "string") {
      return;
    }

    let migrate;
    try {
      ({ migrate } = await loadMigration(repoRoot, migration.module));
    } catch (error) {
      issues.push(`${migration.module} must load successfully: ${error.message}`);
      return;
    }
    if (typeof migrate !== "function") {
      issues.push(`${migration.module} must export a migrate function.`);
      return;
    }

    const input = structuredClone(migrated);
    try {
      const first = await migrate(structuredClone(input));
      const second = await migrate(structuredClone(input));
      if (!isDeepEqual(first, second)) {
        issues.push(`${migration.module} must migrate ${version} deterministically.`);
        return;
      }
      migrated = first;
    } catch (error) {
      issues.push(`${migration.module} must migrate ${version} successfully: ${error.message}`);
      return;
    }

    if (migrated === null || typeof migrated !== "object" || Array.isArray(migrated)) {
      issues.push(`${migration.module} must return an assessment object.`);
      return;
    }
    if (migrated.schemaVersion !== migration.to) {
      issues.push(`${migration.module} must return schemaVersion ${migration.to}.`);
      return;
    }
    version = migration.to;
  }

  const result = validateCurrentAssessment(migrated);
  if (!result.ok) {
    issues.push(`${fixturePath} must migrate to a valid ${currentSchemaVersion} assessment.`);
  }
}

async function loadMigrationModule(repoRoot, modulePath) {
  const resolvedRoot = await realpath(resolve(repoRoot));
  const resolvedModule = await realpath(resolve(repoRoot, modulePath));
  const relativePath = relative(resolvedRoot, resolvedModule);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("resolved migration module must stay inside the repository");
  }
  return import(pathToFileURL(resolvedModule).href);
}

async function readJsonFixture(repoRoot, fixturePath, issues) {
  try {
    return JSON.parse(await readFile(resolve(repoRoot, fixturePath), "utf8"));
  } catch (error) {
    issues.push(`${fixturePath} must be readable JSON: ${error.message}`);
    return undefined;
  }
}

function isRepoRelativePath(repoRoot, candidate) {
  if (isAbsolute(candidate)) {
    return false;
  }
  const resolvedRoot = resolve(repoRoot);
  const resolvedCandidate = resolve(repoRoot, candidate);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function isDeepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runMigrationCheck();
  console.log(
    `migration compatibility passed: current=${result.currentSchemaVersion} known=${result.knownVersionCount} migrations=${result.migrationCount}`,
  );
}
