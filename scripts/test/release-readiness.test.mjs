import assert from "node:assert/strict";
import test from "node:test";

import {
  requiredPackageScripts,
  requiredTestGlobs,
  validatePackageScriptRegistration
} from "../release-readiness.mjs";

test("release readiness accepts the current package script registration", () => {
  const packageJson = {
    scripts: createValidScripts()
  };

  assert.deepEqual(validatePackageScriptRegistration(packageJson), []);
});

test("release readiness rejects missing release-critical scripts", () => {
  const scripts = createValidScripts();
  delete scripts["hosted-live-provider-smoke"];

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.hosted-live-provider-smoke must be configured."
  ]);
});

test("release readiness rejects drifted release-critical script commands", () => {
  const scripts = createValidScripts();
  scripts["release-readiness"] = "node scripts/renamed-release-check.mjs";

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.release-readiness must include scripts/release-readiness.mjs."
  ]);
});

test("release readiness rejects missing package and script test globs", () => {
  const scripts = createValidScripts();
  scripts.test = scripts.test.replace(" packages/action/test/*.test.mjs", "");
  scripts.test = scripts.test.replace(" scripts/test/*.test.mjs", "");

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.test must include packages/action/test/*.test.mjs.",
    "package.json scripts.test must include scripts/test/*.test.mjs."
  ]);
});

function createValidScripts() {
  const scripts = {
    test: `node --test ${requiredTestGlobs.join(" ")}`
  };

  for (const script of requiredPackageScripts) {
    scripts[script.name] = script.includes.join(" && ");
  }

  scripts.check = "pnpm run typecheck && pnpm run test";
  scripts.contract = "pnpm run typecheck && pnpm run test";

  return scripts;
}
