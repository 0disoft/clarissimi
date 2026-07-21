import assert from "node:assert/strict";
import test from "node:test";

import {
  standaloneCliPackageContract,
  validateStandaloneCliPackageManifest,
} from "../build-standalone-cli-package.mjs";
import {
  resolveNpmInvocation,
  validateInstalledPackageManifest,
  validatePackResult,
} from "../verify-standalone-cli-package.mjs";

function createManifest(overrides = {}) {
  return {
    ...standaloneCliPackageContract,
    description: "test",
    type: "module",
    ...overrides,
  };
}

test("standalone CLI manifest accepts the dependency-free publication contract", () => {
  assert.deepEqual(validateStandaloneCliPackageManifest(createManifest()), []);
  assert.deepEqual(standaloneCliPackageContract.bin, {
    clarissimi: "dist/clarissimi.js",
  });
  assert.deepEqual(standaloneCliPackageContract.publishConfig, { access: "public" });
});

test("standalone CLI manifest rejects workspace dependencies and lifecycle scripts", () => {
  assert.deepEqual(
    validateStandaloneCliPackageManifest(
      createManifest({
        dependencies: { "@clarissimi/core": "workspace:*" },
        scripts: { postinstall: "node install.mjs" },
      }),
    ),
    [
      "dependencies must be omitted from the dependency-free standalone package.",
      "scripts must be omitted so installation cannot run lifecycle code.",
    ],
  );
});

test("standalone CLI pack result accepts only the four public package files", () => {
  assert.doesNotThrow(() =>
    validatePackResult({
      name: "clarissimi",
      version: "0.1.0",
      files: [
        { path: "package.json" },
        { path: "README.md" },
        { path: "LICENSE" },
        { path: "dist/clarissimi.js" },
      ],
    }),
  );
});

test("standalone CLI pack result rejects source leakage", () => {
  assert.throws(
    () =>
      validatePackResult({
        name: "clarissimi",
        version: "0.1.0",
        files: [
          { path: "package.json" },
          { path: "README.md" },
          { path: "LICENSE" },
          { path: "dist/clarissimi.js" },
          { path: "src/index.ts" },
        ],
      }),
    /npm pack files must equal/,
  );
});

test("standalone CLI installed manifest preserves the executable mapping", () => {
  assert.deepEqual(
    validateInstalledPackageManifest({
      name: "clarissimi",
      version: "0.1.0",
      bin: { clarissimi: "dist/clarissimi.js" },
    }),
    [],
  );
  assert.deepEqual(
    validateInstalledPackageManifest({
      name: "clarissimi",
      version: "0.1.0",
    }),
    ['bin must equal {"clarissimi":"dist/clarissimi.js"}.'],
  );
});

test("standalone CLI verifier invokes npm through Node on Windows without a shell", async () => {
  const accessed = [];
  const invocation = await resolveNpmInvocation({
    platform: "win32",
    nodePath: "C:\\runtime\\node.exe",
    access: async (path) => {
      accessed.push(path);
    },
  });

  assert.deepEqual(accessed, ["C:\\runtime\\node_modules\\npm\\bin\\npm-cli.js"]);
  assert.deepEqual(invocation, {
    command: "C:\\runtime\\node.exe",
    prefixArgs: ["C:\\runtime\\node_modules\\npm\\bin\\npm-cli.js"],
  });
});
