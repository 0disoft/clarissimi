export const requiredPackageScripts = [
  {
    name: "benchmark:cli-io",
    includes: ["pnpm run build", "scripts/benchmark-cli-io.mjs --check"],
  },
  {
    name: "benchmark:cli-io:sample",
    includes: ["pnpm run build", "scripts/benchmark-cli-io.mjs --samples 3"],
  },
  { name: "benchmark:scale", includes: ["pnpm run build", "scripts/benchmark-scale.mjs --check"] },
  {
    name: "benchmark:scale:sample",
    includes: ["pnpm run build", "scripts/benchmark-scale.mjs --samples 3"],
  },
  { name: "bundle:action", includes: ["pnpm run build", "scripts/bundle-action.mjs"] },
  {
    name: "bundle:action:check",
    includes: ["pnpm run build", "scripts/bundle-action.mjs --check"],
  },
  {
    name: "bundle:cli-package",
    includes: ["pnpm run build", "scripts/build-standalone-cli-package.mjs"],
  },
  { name: "docs", includes: ["scripts/validate-docs.mjs"] },
  { name: "smoke", includes: ["scripts/smoke.mjs"] },
  { name: "lint", includes: ["oxlint . --deny-warnings"] },
  { name: "format", includes: ["oxfmt --check"] },
  {
    name: "migration-check",
    includes: ["pnpm run build", "scripts/migration-check.mjs"],
  },
  { name: "check", includes: ["pnpm run typecheck", "pnpm run test"] },
  { name: "contract", includes: ["pnpm run typecheck", "pnpm run test"] },
  { name: "release-readiness", includes: ["scripts/release-readiness.mjs"] },
  {
    name: "test:cli-completion",
    includes: ["pnpm run build", "packages/cli/test/completion.test.mjs"],
  },
  {
    name: "test:automation-contributors",
    includes: [
      "pnpm run build",
      "packages/schemas/test/*.test.mjs",
      "packages/github/test/*.test.mjs",
      "packages/renderers/test/*.test.mjs",
      "packages/cli/test/*.test.mjs",
      "packages/action/test/*.test.mjs",
    ],
  },
  {
    name: "test:cli-lock",
    includes: ["pnpm run build", "import-draft serializes concurrent ledger updates"],
  },
  {
    name: "retire-historical-command-intents",
    includes: ["scripts/retire-historical-command-intents.mjs"],
  },
  {
    name: "verify:cli-package",
    includes: ["pnpm run build", "scripts/verify-standalone-cli-package.mjs"],
  },
  { name: "live-provider-smoke", includes: ["scripts/live-provider-smoke.mjs"] },
  { name: "hosted-ci-validation", includes: ["scripts/hosted-ci-validation.mjs"] },
  {
    name: "hosted-external-consumer-smoke",
    includes: ["scripts/hosted-external-consumer-smoke.mjs"],
  },
  {
    name: "hosted-live-provider-smoke",
    includes: ["scripts/hosted-live-provider-smoke.mjs"],
  },
  { name: "verify-action-major-tag", includes: ["scripts/verify-action-major-tag.mjs"] },
  { name: "verify-marketplace-release", includes: ["scripts/verify-marketplace-release.mjs"] },
  {
    name: "release-candidate-evidence-orchestrator",
    includes: ["scripts/release-candidate-evidence-orchestrator.mjs"],
  },
  { name: "publish-action-release", includes: ["scripts/publish-action-release.mjs"] },
  { name: "promote-action-major-alias", includes: ["scripts/promote-action-major-alias.mjs"] },
  { name: "release-evidence-cleanup", includes: ["scripts/release-evidence-cleanup.mjs"] },
  {
    name: "release-candidate-evidence-issue",
    includes: ["scripts/release-candidate-evidence-issue.mjs"],
  },
];

export const requiredTestGlobs = [
  "packages/schemas/test/*.test.mjs",
  "packages/redaction/test/*.test.mjs",
  "packages/core/test/*.test.mjs",
  "packages/github/test/*.test.mjs",
  "packages/providers/test/*.test.mjs",
  "packages/renderers/test/*.test.mjs",
  "packages/cli/test/*.test.mjs",
  "packages/action/test/*.test.mjs",
  "scripts/test/*.test.mjs",
];

export function validatePackageScriptRegistration(packageJson) {
  const issues = [];
  const scripts = packageJson?.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    return ["package.json scripts must be configured."];
  }

  for (const script of requiredPackageScripts) {
    const value = scripts[script.name];
    if (typeof value !== "string") {
      issues.push(`package.json scripts.${script.name} must be configured.`);
      continue;
    }

    for (const expected of script.includes) {
      if (!value.includes(expected)) {
        issues.push(`package.json scripts.${script.name} must include ${expected}.`);
      }
    }
  }

  const testScript = scripts.test;
  if (typeof testScript !== "string") {
    issues.push("package.json scripts.test must be configured.");
    return issues;
  }

  for (const glob of requiredTestGlobs) {
    if (!testScript.includes(glob)) {
      issues.push(`package.json scripts.test must include ${glob}.`);
    }
  }

  return issues;
}
