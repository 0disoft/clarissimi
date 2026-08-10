export function validateRootPackageManager(packageJson, contract) {
  const issues = [];

  if (packageJson?.packageManager !== contract.packageManager) {
    issues.push(`${contract.path} packageManager must remain ${contract.packageManager}.`);
  }

  return issues;
}

export function validatePackageReleasePolicy(packageJson, policy, manifestPath) {
  const issues = [];

  if (packageJson?.private !== policy.private) {
    issues.push(
      `${manifestPath} private must remain ${String(policy.private)} while workspace-package publication is blocked.`,
    );
  }

  if (packageJson?.version !== policy.version) {
    issues.push(
      `${manifestPath} version must remain ${policy.version} while workspace-package publication is blocked.`,
    );
  }

  return issues;
}

export function validateWorkspaceContract(text, contract) {
  const issues = [];

  if (!text.includes(contract.requiredPackageGlob)) {
    issues.push(
      `${contract.path} must include workspace package glob ${contract.requiredPackageGlob}.`,
    );
  }

  if (!text.includes(contract.requiredBuildAllow)) {
    issues.push(`${contract.path} must explicitly allow the pinned esbuild install script.`);
  }

  return issues;
}

export function validateWorkspacePackageManifest(packageJson, packageDir, manifestPath, contract) {
  const issues = [];
  const expectedName = `${contract.packageNameScope}/${packageDir}`;

  if (packageJson?.name !== expectedName) {
    issues.push(`${manifestPath} name must be ${expectedName}.`);
  }

  if (packageJson?.type !== "module") {
    issues.push(`${manifestPath} type must remain module.`);
  }

  return issues;
}

export function validateWorkspacePackageManifestSurface(
  packageJson,
  packageDir,
  manifestPath,
  contract,
) {
  const issues = [];

  if (packageJson?.main !== contract.main) {
    issues.push(`${manifestPath} main must remain ${contract.main}.`);
  }

  if (packageJson?.types !== contract.types) {
    issues.push(`${manifestPath} types must remain ${contract.types}.`);
  }

  const exportRoot = packageJson?.exports?.["."];
  if (exportRoot === null || typeof exportRoot !== "object" || Array.isArray(exportRoot)) {
    issues.push(`${manifestPath} exports["."] must define types and default entrypoints.`);
  } else {
    if (exportRoot.types !== contract.types) {
      issues.push(`${manifestPath} exports["."].types must remain ${contract.types}.`);
    }

    if (exportRoot.default !== contract.main) {
      issues.push(`${manifestPath} exports["."].default must remain ${contract.main}.`);
    }
  }

  if (!arraysEqual(packageJson?.files, contract.files)) {
    issues.push(`${manifestPath} files must remain ${JSON.stringify(contract.files)}.`);
  }

  if (packageJson?.license !== contract.license) {
    issues.push(`${manifestPath} license must remain ${contract.license}.`);
  }

  if (!objectsEqual(packageJson?.repository, expectedPackageRepository(packageDir, contract))) {
    issues.push(`${manifestPath} repository metadata must point at packages/${packageDir}.`);
  }

  if (packageJson?.homepage !== contract.homepage) {
    issues.push(`${manifestPath} homepage must remain ${contract.homepage}.`);
  }

  if (!objectsEqual(packageJson?.bugs, contract.bugs)) {
    issues.push(`${manifestPath} bugs metadata must remain ${JSON.stringify(contract.bugs)}.`);
  }

  if (!objectsEqual(packageJson?.engines, contract.engines)) {
    issues.push(`${manifestPath} engines must remain ${JSON.stringify(contract.engines)}.`);
  }

  for (const [scriptName, expectedValue] of Object.entries(contract.scripts)) {
    if (packageJson?.scripts?.[scriptName] !== expectedValue) {
      issues.push(`${manifestPath} scripts.${scriptName} must remain ${expectedValue}.`);
    }
  }

  const expectedBin = contract.binsByPackageDir[packageDir];
  if (expectedBin === undefined) {
    if (packageJson?.bin !== undefined) {
      issues.push(`${manifestPath} must not expose package bin entries.`);
    }
  } else if (!objectsEqual(packageJson?.bin, expectedBin)) {
    issues.push(`${manifestPath} bin must remain ${JSON.stringify(expectedBin)}.`);
  }

  return issues;
}

export function validateWorkspaceInternalDependencies(
  packageJson,
  packageDir,
  manifestPath,
  contract,
  packageNameScope,
) {
  const issues = [];
  const allowedDirs = contract.dependenciesByPackageDir[packageDir];
  if (allowedDirs === undefined) {
    issues.push(`${manifestPath} has no internal dependency contract for packages/${packageDir}.`);
    return issues;
  }

  const expectedNames = allowedDirs.map((dir) => `${packageNameScope}/${dir}`);
  const expectedSet = new Set(expectedNames);
  const runtimeDependencies = dependencyEntries(packageJson?.dependencies);
  const declaredRuntimeInternal = runtimeDependencies.filter(([name]) =>
    name.startsWith(contract.internalScope),
  );
  const declaredRuntimeNames = new Set(declaredRuntimeInternal.map(([name]) => name));

  for (const name of expectedNames) {
    if (!declaredRuntimeNames.has(name)) {
      issues.push(`${manifestPath} dependencies must include ${name}: ${contract.workspaceRange}.`);
    }
  }

  for (const [name, version] of declaredRuntimeInternal) {
    if (!expectedSet.has(name)) {
      issues.push(
        `${manifestPath} dependencies must not include undeclared internal dependency ${name}.`,
      );
      continue;
    }

    if (version !== contract.workspaceRange) {
      issues.push(`${manifestPath} dependency ${name} must use ${contract.workspaceRange}.`);
    }
  }

  for (const sectionName of ["devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name] of dependencyEntries(packageJson?.[sectionName])) {
      if (name.startsWith(contract.internalScope)) {
        issues.push(
          `${manifestPath} ${sectionName} must not declare internal dependency ${name}; use dependencies.`,
        );
      }
    }
  }

  return issues;
}

export function validateTrackedGeneratedOutputPaths(paths, contract) {
  const issues = [];

  for (const rawPath of paths) {
    const path = rawPath.replaceAll("\\", "/");

    if (contract.forbiddenPathSuffixes.some((suffix) => path.endsWith(suffix))) {
      issues.push(`tracked generated output must not include ${path}.`);
      continue;
    }

    const boundedPath = `/${path}`;
    if (contract.forbiddenPathFragments.some((fragment) => boundedPath.includes(fragment))) {
      issues.push(`tracked generated output must not include ${path}.`);
    }
  }

  return issues;
}

export function validateRootTsconfigReferences(tsconfig, packageDirs, contract) {
  const issues = [];
  const referencePaths = tsconfigReferencePaths(tsconfig?.references, contract.path, issues);
  const expectedPaths = packageDirs.map((dir) => `${contract.packageReferencePrefix}${dir}`);
  const expectedSet = new Set(expectedPaths);
  const declaredSet = new Set(referencePaths);

  for (const expected of expectedPaths) {
    if (!declaredSet.has(expected)) {
      issues.push(`${contract.path} references must include ${expected}.`);
    }
  }

  for (const referencePath of referencePaths) {
    if (!expectedSet.has(referencePath)) {
      issues.push(
        `${contract.path} references must not include undeclared project reference ${referencePath}.`,
      );
    }
  }

  return issues;
}

export function validateWorkspacePackageTsconfigReferences(
  tsconfig,
  packageDir,
  tsconfigPath,
  contract,
) {
  const issues = [];
  const allowedDirs = contract.dependenciesByPackageDir[packageDir];
  if (allowedDirs === undefined) {
    issues.push(`${tsconfigPath} has no internal dependency contract for packages/${packageDir}.`);
    return issues;
  }

  if (tsconfig?.compilerOptions?.composite !== true) {
    issues.push(
      `${tsconfigPath} compilerOptions.composite must remain true for TypeScript project references.`,
    );
  }

  const referencePaths = tsconfigReferencePaths(tsconfig?.references, tsconfigPath, issues);
  const expectedPaths = allowedDirs.map((dir) => `../${dir}`);
  const expectedSet = new Set(expectedPaths);
  const declaredSet = new Set(referencePaths);

  for (const expected of expectedPaths) {
    if (!declaredSet.has(expected)) {
      issues.push(`${tsconfigPath} references must include ${expected}.`);
    }
  }

  for (const referencePath of referencePaths) {
    if (!expectedSet.has(referencePath)) {
      issues.push(
        `${tsconfigPath} references must not include undeclared project reference ${referencePath}.`,
      );
    }
  }

  return issues;
}

export function validatePackageOwnershipContract(text, packageDirs, contract) {
  const issues = [];
  const tableEntries = extractPackageOwnershipEntries(text);
  const documentedPackages = new Set(tableEntries.map((entry) => entry.packagePath));
  const workspacePackages = new Set(packageDirs.map((dir) => `packages/${dir}`));

  for (const packagePath of workspacePackages) {
    if (!documentedPackages.has(packagePath)) {
      issues.push(`${contract.path} missing Package Table entry for ${packagePath}.`);
    }
  }

  for (const entry of tableEntries) {
    if (!workspacePackages.has(entry.packagePath)) {
      issues.push(`${contract.path} references missing workspace package ${entry.packagePath}.`);
    }

    if (entry.status !== "Implemented") {
      issues.push(
        `${contract.path} Package Table entry for ${entry.packagePath} must have status Implemented.`,
      );
    }
  }

  for (const adrPath of contract.requiredAdrReferences) {
    if (!text.includes(adrPath)) {
      issues.push(`${contract.path} must include related ADR ${adrPath}.`);
    }
  }

  return issues;
}

function expectedPackageRepository(packageDir, contract) {
  return {
    ...contract.repository,
    directory: `packages/${packageDir}`,
  };
}

function extractPackageOwnershipEntries(text) {
  const entries = [];
  const lines = extractMarkdownSection(text, "Package Table").split(/\r?\n/);
  const pattern = /^\|\s*`(?<packagePath>packages\/[^`]+)`\s*\|\s*(?<status>[^|]+?)\s*\|/;

  for (const line of lines) {
    const match = pattern.exec(line);
    if (match?.groups === undefined) {
      continue;
    }

    entries.push({
      packagePath: match.groups.packagePath.trim(),
      status: match.groups.status.trim(),
    });
  }

  return entries;
}

function extractMarkdownSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (headingPattern.test(lines[index])) {
      start = index + 1;
      break;
    }
  }

  if (start === -1) {
    return "";
  }

  const sectionLines = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      break;
    }

    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dependencyEntries(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value);
}

function arraysEqual(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }

  return actual.every((value, index) => value === expected[index]);
}

function objectsEqual(actual, expected) {
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }

  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  if (actualEntries.length !== expectedEntries.length) {
    return false;
  }

  return expectedEntries.every(([key, value]) => actual[key] === value);
}

function tsconfigReferencePaths(value, path, issues) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`${path} references must be an array when present.`);
    return [];
  }

  const paths = [];
  for (const reference of value) {
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
      issues.push(`${path} references entries must be objects with a path string.`);
      continue;
    }

    if (typeof reference.path !== "string" || reference.path.length === 0) {
      issues.push(`${path} references entries must include a non-empty path string.`);
      continue;
    }

    paths.push(reference.path);
  }

  return paths;
}
