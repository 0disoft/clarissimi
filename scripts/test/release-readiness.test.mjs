import assert from "node:assert/strict";
import test from "node:test";

import {
  dogfoodWorkflowContracts,
  findHighRiskSecretLines,
  packageOwnershipContract,
  packageReleasePolicy,
  requiredPackageScripts,
  requiredTestGlobs,
  validateActionManifestContract,
  validateCiOperationalDocumentContract,
  validateCiWorkflowContract,
  validateCredentialedReleaseEvidence,
  validateDryRunDogfoodEvidence,
  validateDogfoodWorkflowContract,
  validateHostedLiveProviderWorkflowContract,
  validateObservabilityDocumentContract,
  validateOperationalContractDocumentContract,
  validatePackageOwnershipContract,
  validatePackageReleasePolicy,
  validatePackageScriptRegistration,
  validateProductPositioningContract,
  validateReleasePolicyDocumentContract,
  validateRootTsconfigReferences,
  validateRollbackProcedureContract,
  validateSmokePackCandidateContract,
  validateTrackedGeneratedOutputPaths,
  validateWorkspaceContract,
  validateWorkspaceInternalDependencies,
  validateWorkspacePackageManifest,
  validateWorkspacePackageManifestSurface,
  validateWorkspacePackageTsconfigReferences,
  validateWorkflowTrustBoundaryContract,
  validateWriteModeDogfoodEvidence
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
  scripts.lint = "node -e \"process.exit(1)\"";

  const issues = validatePackageScriptRegistration({ scripts });

  assert.deepEqual(issues, [
    "package.json scripts.lint must include oxlint . --deny-warnings.",
    "package.json scripts.release-readiness must include scripts/release-readiness.mjs."
  ]);
});

test("release readiness keeps deferred validations intentionally fail-closed", () => {
  const scripts = createValidScripts();

  assert.deepEqual(validatePackageScriptRegistration({ scripts }), []);
});

test("release readiness rejects fake or premature format command drift", () => {
  const fakeSuccessScripts = createValidScripts();
  fakeSuccessScripts.format = "node -e \"console.log('formatted')\"";

  assert.deepEqual(validatePackageScriptRegistration({ scripts: fakeSuccessScripts }), [
    "package.json scripts.format must include format is not configured.",
    "package.json scripts.format must include process.exit(1)."
  ]);

  const prematureFormatterScripts = createValidScripts();
  prematureFormatterScripts.format = "oxfmt --write .";

  assert.deepEqual(validatePackageScriptRegistration({ scripts: prematureFormatterScripts }), [
    "package.json scripts.format must include format is not configured.",
    "package.json scripts.format must include process.exit(1).",
    "package.json scripts.format must not use oxfmt until a formatter baseline is accepted."
  ]);
});

test("release readiness rejects fake migration-check command drift", () => {
  const scripts = createValidScripts();
  scripts["migration-check"] = "node -e \"console.log('no migrations')\"";

  assert.deepEqual(validatePackageScriptRegistration({ scripts }), [
    "package.json scripts.migration-check must include migration-check is not configured.",
    "package.json scripts.migration-check must include process.exit(1)."
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

test("release readiness accepts smoke package pack candidate coverage", () => {
  assert.deepEqual(validateSmokePackCandidateContract(createSmokeScriptText()), []);
});

test("release readiness rejects missing smoke package pack candidate coverage", () => {
  const text = createSmokeScriptText()
    .replace("assertWorkspacePackagePackDryRuns", "assertWorkspacePackages")
    .replace("\"README.md\",", "")
    .replace("path.startsWith(\"src/\")", "false")
    .replace(
      "{ dir: \"action\", requiredFiles: [\"dist/bin/clarissimi-action.js\"] }",
      "{ dir: \"action\" }"
    );

  assert.deepEqual(validateSmokePackCandidateContract(text), [
    "scripts/smoke.mjs must include assertWorkspacePackagePackDryRuns.",
    "scripts/smoke.mjs must include { dir: \"action\", requiredFiles: [\"dist/bin/clarissimi-action.js\"] }.",
    "scripts/smoke.mjs must include README.md.",
    "scripts/smoke.mjs must include src/."
  ]);
});

test("release readiness accepts the current package release policy", () => {
  assert.deepEqual(validatePackageReleasePolicy(createBlockedReleasePackageJson()), []);
});

test("release readiness rejects accidental public package release drift", () => {
  const packageJson = createBlockedReleasePackageJson();
  packageJson.private = false;
  packageJson.version = "0.1.0";

  assert.deepEqual(validatePackageReleasePolicy(packageJson), [
    "package.json private must remain true until release blockers are cleared.",
    "package.json version must remain 0.0.0 until release blockers are cleared."
  ]);
});

test("release readiness reports workspace package release policy drift with manifest paths", () => {
  const packageJson = createBlockedReleasePackageJson();
  packageJson.private = false;
  packageJson.version = "0.2.0";

  assert.deepEqual(validatePackageReleasePolicy(packageJson, packageReleasePolicy, "packages/cli/package.json"), [
    "packages/cli/package.json private must remain true until release blockers are cleared.",
    "packages/cli/package.json version must remain 0.0.0 until release blockers are cleared."
  ]);
});

test("release readiness accepts the blocked release policy document contract", () => {
  assert.deepEqual(validateReleasePolicyDocumentContract(createReleasePolicyText()), []);
});

test("release readiness rejects release policy document drift", () => {
  const text = createReleasePolicyText()
    .replace("Clarissimi is not ready for public package publication.", "Clarissimi can publish packages.")
    .replace("- Public package publication: blocked.", "- Public package publication: allowed.")
    .replace("- Versioned GitHub Action tag: blocked.", "- Versioned GitHub Action tag: allowed.")
    .replace("Do not bump versions, publish packages, or create", "Bump versions and publish packages.")
    .replace("public product-positioning guardrails", "public docs")
    .replace("intentionally fail-closed `format` and `migration-check`", "format and migration checks");

  assert.deepEqual(validateReleasePolicyDocumentContract(text), [
    "docs/ops/release.md must include Clarissimi is not ready for public package publication..",
    "docs/ops/release.md must include Do not bump versions, publish packages, or create.",
    "docs/ops/release.md must include - Public package publication: blocked..",
    "docs/ops/release.md must include - Versioned GitHub Action tag: blocked..",
    "docs/ops/release.md must include public product-positioning guardrails.",
    "docs/ops/release.md must include intentionally fail-closed `format` and `migration-check`."
  ]);
});

test("release readiness accepts the product positioning contract", () => {
  assert.deepEqual(validateProductPositioningContract(createProductPositioningTexts()), []);
});

test("release readiness rejects product positioning drift", () => {
  const texts = createProductPositioningTexts();
  texts["README.md"] = texts["README.md"]
    .replace(
      "Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories.",
      "Clarissimi is a contribution automation tool for open-source repositories."
    )
    .replace("Public output should read like contribution history, not a scoreboard.", "");
  texts["docs/product/02-spec.md"] = texts["docs/product/02-spec.md"]
    .replace("Clarissimi must be described as a contribution recognition engine.", "Clarissimi is flexible.")
    .replace("maintainer-only analytics view unless a future ADR accepts a safer public framing.", "")
    + "\nPublic output should show contributor scores.\n";

  assert.deepEqual(validateProductPositioningContract(texts), [
    "README.md must include Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories..",
    "README.md must include Public output should read like contribution history, not a scoreboard..",
    "docs/product/02-spec.md must include Clarissimi must be described as a contribution recognition engine..",
    "docs/product/02-spec.md must include maintainer-only analytics view unless a future ADR accepts a safer public framing..",
    "docs/product/02-spec.md must not include Public output should show contributor scores.."
  ]);
});

test("release readiness accepts the CI operational document contract", () => {
  assert.deepEqual(validateCiOperationalDocumentContract(createCiOperationalDocumentText()), []);
});

test("release readiness rejects CI operational document drift", () => {
  const text = createCiOperationalDocumentText()
    .replace("`lint`, `smoke`, `check`, and `contract` with Node.js 24", "`smoke`, `check`, and `contract` with Node.js 24")
    .replace("The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`", "The `main` branch is protected by maintainers")
    .replace("to pass with strict up-to-date status checks. Administrator enforcement is disabled", "with repository-owner recovery.")
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateCiOperationalDocumentContract(text), [
    "docs/ops/ci.md must include `lint`, `smoke`, `check`, and `contract` with Node.js 24.",
    "docs/ops/ci.md must include The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`.",
    "docs/ops/ci.md must include to pass with strict up-to-date status checks. Administrator enforcement is disabled.",
    "docs/ops/ci.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the operational contract document contract", () => {
  assert.deepEqual(validateOperationalContractDocumentContract(createOperationalContractDocumentText()), []);
});

test("release readiness rejects operational contract document drift", () => {
  const text = createOperationalContractDocumentText()
    .replace(
      "Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
      "Correctness gate: `pnpm run docs`,"
    )
    .replace(
      "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges.",
      "`pnpm run smoke`, `pnpm run check`, and `pnpm run contract` should usually pass."
    )
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateOperationalContractDocumentContract(text), [
    "docs/ops/00-operational-contract.md must include Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,.",
    "docs/ops/00-operational-contract.md must include `pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges..",
    "docs/ops/00-operational-contract.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts the observability document contract", () => {
  assert.deepEqual(validateObservabilityDocumentContract(createObservabilityDocumentText()), []);
});

test("release readiness rejects observability document drift", () => {
  const text = createObservabilityDocumentText()
    .replace(
      "hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`",
      "hosted CI run status for `docs`, `smoke`, `check`, and `contract`"
    )
    .replace("- `pnpm run release-readiness`", "")
    .replace("- `pnpm run lint`", "")
    .replace(
      "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
      "- Required validation names: `docs`, `smoke`, `check`, `contract`"
    );

  assert.deepEqual(validateObservabilityDocumentContract(text), [
    "docs/ops/observability.md must include hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`.",
    "docs/ops/observability.md must include - `pnpm run release-readiness`.",
    "docs/ops/observability.md must include - `pnpm run lint`.",
    "docs/ops/observability.md must include - Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`."
  ]);
});

test("release readiness accepts workspace contract and package manifest identity", () => {
  assert.deepEqual(validateWorkspaceContract('packages:\n  - "packages/*"\n'), []);
  assert.deepEqual(
    validateWorkspacePackageManifest(
      {
        name: "@clarissimi/cli",
        type: "module"
      },
      "cli",
      "packages/cli/package.json"
    ),
    []
  );
});

test("release readiness rejects workspace and package manifest identity drift", () => {
  assert.deepEqual(validateWorkspaceContract("packages:\n  - apps/*\n"), [
    'pnpm-workspace.yaml must include workspace package glob "packages/*".'
  ]);

  assert.deepEqual(
    validateWorkspacePackageManifest(
      {
        name: "@clarissimi/renamed-cli",
        type: "commonjs"
      },
      "cli",
      "packages/cli/package.json"
    ),
    [
      "packages/cli/package.json name must be @clarissimi/cli.",
      "packages/cli/package.json type must remain module."
    ]
  );
});

test("release readiness accepts workspace package manifest publish surfaces", () => {
  assert.deepEqual(
    validateWorkspacePackageManifestSurface(createWorkspacePackageManifest(), "schemas", "packages/schemas/package.json"),
    []
  );

  assert.deepEqual(
    validateWorkspacePackageManifestSurface(
      {
        ...createWorkspacePackageManifest("cli"),
        bin: {
          clarissimi: "./dist/bin/clarissimi.js"
        }
      },
      "cli",
      "packages/cli/package.json"
    ),
    []
  );
});

test("release readiness rejects workspace package manifest publish surface drift", () => {
  const packageJson = {
    ...createWorkspacePackageManifest(),
    main: "./src/index.ts",
    types: "./dist/renamed.d.ts",
    exports: {
      ".": {
        types: "./dist/renamed.d.ts",
        default: "./dist/renamed.js"
      }
    },
    files: ["dist", "src"],
    license: "UNLICENSED",
    repository: {
      type: "git",
      url: "https://example.invalid/clarissimi.git"
    },
    homepage: "https://example.invalid/clarissimi",
    bugs: {
      url: "https://example.invalid/bugs"
    },
    engines: {
      node: ">=20"
    },
    scripts: {
      build: "tsc",
      typecheck: "tsc --noEmit"
    },
    bin: {
      extra: "./dist/bin/extra.js"
    }
  };

  assert.deepEqual(
    validateWorkspacePackageManifestSurface(packageJson, "schemas", "packages/schemas/package.json"),
    [
      "packages/schemas/package.json main must remain ./dist/index.js.",
      "packages/schemas/package.json types must remain ./dist/index.d.ts.",
      "packages/schemas/package.json exports[\".\"].types must remain ./dist/index.d.ts.",
      "packages/schemas/package.json exports[\".\"].default must remain ./dist/index.js.",
      "packages/schemas/package.json files must remain [\"dist\"].",
      "packages/schemas/package.json license must remain Apache-2.0.",
      "packages/schemas/package.json repository metadata must point at packages/schemas.",
      "packages/schemas/package.json homepage must remain https://github.com/0disoft/clarissimi#readme.",
      "packages/schemas/package.json bugs metadata must remain {\"url\":\"https://github.com/0disoft/clarissimi/issues\"}.",
      "packages/schemas/package.json engines must remain {\"node\":\">=24\"}.",
      "packages/schemas/package.json scripts.build must remain tsc -b.",
      "packages/schemas/package.json scripts.typecheck must remain tsc -b --pretty false.",
      "packages/schemas/package.json must not expose package bin entries."
    ]
  );

  assert.deepEqual(
    validateWorkspacePackageManifestSurface(createWorkspacePackageManifest("cli"), "cli", "packages/cli/package.json"),
    [
      "packages/cli/package.json bin must remain {\"clarissimi\":\"./dist/bin/clarissimi.js\"}."
    ]
  );
});

test("release readiness accepts the internal workspace dependency graph", () => {
  assert.deepEqual(
    validateWorkspaceInternalDependencies(
      {
        dependencies: {
          "@clarissimi/core": "workspace:*",
          "@clarissimi/github": "workspace:*",
          "@clarissimi/providers": "workspace:*",
          "@clarissimi/renderers": "workspace:*",
          "@clarissimi/schemas": "workspace:*"
        }
      },
      "cli",
      "packages/cli/package.json"
    ),
    []
  );

  assert.deepEqual(
    validateWorkspaceInternalDependencies(
      {},
      "schemas",
      "packages/schemas/package.json"
    ),
    []
  );
});

test("release readiness rejects internal workspace dependency drift", () => {
  assert.deepEqual(
    validateWorkspaceInternalDependencies(
      {
        dependencies: {
          "@clarissimi/core": "workspace:^",
          "@clarissimi/renderers": "workspace:*"
        },
        devDependencies: {
          "@clarissimi/schemas": "workspace:*"
        }
      },
      "providers",
      "packages/providers/package.json"
    ),
    [
      "packages/providers/package.json dependencies must include @clarissimi/schemas: workspace:*.",
      "packages/providers/package.json dependency @clarissimi/core must use workspace:*.",
      "packages/providers/package.json dependencies must not include undeclared internal dependency @clarissimi/renderers.",
      "packages/providers/package.json devDependencies must not declare internal dependency @clarissimi/schemas; use dependencies."
    ]
  );
});

test("release readiness accepts the TypeScript build graph", () => {
  assert.deepEqual(
    validateRootTsconfigReferences(
      {
        references: [
          { path: "./packages/schemas" },
          { path: "./packages/cli" }
        ]
      },
      ["cli", "schemas"]
    ),
    []
  );

  assert.deepEqual(
    validateWorkspacePackageTsconfigReferences(
      {
        compilerOptions: {
          composite: true
        },
        references: [
          { path: "../schemas" },
          { path: "../core" }
        ]
      },
      "providers",
      "packages/providers/tsconfig.json"
    ),
    []
  );

  assert.deepEqual(
    validateWorkspacePackageTsconfigReferences(
      {
        compilerOptions: {
          composite: true
        }
      },
      "schemas",
      "packages/schemas/tsconfig.json"
    ),
    []
  );
});

test("release readiness rejects TypeScript build graph drift", () => {
  assert.deepEqual(
    validateRootTsconfigReferences(
      {
        references: [
          { path: "./packages/schemas" },
          { path: "./packages/old-cli" }
        ]
      },
      ["cli", "schemas"]
    ),
    [
      "tsconfig.json references must include ./packages/cli.",
      "tsconfig.json references must not include undeclared project reference ./packages/old-cli."
    ]
  );

  assert.deepEqual(
    validateWorkspacePackageTsconfigReferences(
      {
        compilerOptions: {
          composite: false
        },
        references: [
          { path: "../core" },
          { path: "../renderers" }
        ]
      },
      "providers",
      "packages/providers/tsconfig.json"
    ),
    [
      "packages/providers/tsconfig.json compilerOptions.composite must remain true for TypeScript project references.",
      "packages/providers/tsconfig.json references must include ../schemas.",
      "packages/providers/tsconfig.json references must not include undeclared project reference ../renderers."
    ]
  );
});

test("release readiness rejects tracked generated output paths", () => {
  assert.deepEqual(
    validateTrackedGeneratedOutputPaths([
      "README.md",
      "packages/cli/src/index.ts",
      "packages/cli/dist/index.js",
      "packages/core/tsconfig.tsbuildinfo",
      "coverage/report.json",
      "node_modules/example/index.js"
    ]),
    [
      "tracked generated output must not include packages/cli/dist/index.js.",
      "tracked generated output must not include packages/core/tsconfig.tsbuildinfo.",
      "tracked generated output must not include coverage/report.json.",
      "tracked generated output must not include node_modules/example/index.js."
    ]
  );
});

test("release readiness accepts package ownership table coverage", () => {
  assert.deepEqual(
    validatePackageOwnershipContract(createPackageOwnershipText(), ["cli", "schemas"]),
    []
  );
});

test("release readiness rejects package ownership table drift", () => {
  const text = createPackageOwnershipText()
    .replace("| `packages/cli` | Implemented |", "| `packages/old-cli` | Implemented |")
    .replace("| `packages/schemas` | Implemented |", "| `packages/schemas` | Planned |");

  assert.deepEqual(validatePackageOwnershipContract(text, ["cli", "schemas"]), [
    `${packageOwnershipContract.path} missing Package Table entry for packages/cli.`,
    `${packageOwnershipContract.path} references missing workspace package packages/old-cli.`,
    `${packageOwnershipContract.path} Package Table entry for packages/schemas must have status Implemented.`
  ]);
});

test("release readiness accepts recorded credentialed release evidence", () => {
  assert.deepEqual(validateCredentialedReleaseEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts recorded write-mode dogfood evidence", () => {
  assert.deepEqual(validateWriteModeDogfoodEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts recorded dry-run dogfood evidence", () => {
  assert.deepEqual(validateDryRunDogfoodEvidence(createReleaseEvidenceText()), []);
});

test("release readiness accepts rollback procedure coverage", () => {
  assert.deepEqual(validateRollbackProcedureContract(createRollbackProcedureText()), []);
});

test("release readiness rejects missing rollback procedure coverage", () => {
  const text = createRollbackProcedureText()
    .replace("Delete the temporary staging directory.", "Clean up temporary files.")
    .replace("Close the proposal pull request and delete the proposal branch.", "Resolve the proposal.")
    .replace("Revert the recognition pull request", "Undo the recognition change")
    .replace("No database rollback exists in the MVP.", "Database rollback is TBD.");

  assert.deepEqual(validateRollbackProcedureContract(text), [
    "docs/ops/rollback.md must include Delete the temporary staging directory..",
    "docs/ops/rollback.md must include Close the proposal pull request and delete the proposal branch..",
    "docs/ops/rollback.md must include Revert the recognition pull request.",
    "docs/ops/rollback.md must include No database rollback exists in the MVP.."
  ]);
});

test("release readiness rejects missing hosted credentialed release evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run", "")
    .replace("`29018826925` passed on `2026-07-09T12:39:17Z`", "passed");

  assert.deepEqual(validateCredentialedReleaseEvidence(text), [
    "docs/ops/release.md must include Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run.",
    "docs/ops/release.md must include a numeric hosted live-provider workflow run id.",
    "docs/ops/release.md must include a hosted live-provider workflow timestamp."
  ]);
});

test("release readiness rejects missing write-mode dogfood evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Current dogfood evidence: `Clarissimi propose fixture` workflow run", "")
    .replace("`29027800039` passed on `2026-07-09T15:02:15Z`", "passed")
    .replace("https://github.com/0disoft/clarissimi/pull/2", "");

  assert.deepEqual(validateWriteModeDogfoodEvidence(text), [
    "docs/ops/release.md must include Current dogfood evidence: `Clarissimi propose fixture` workflow run.",
    "docs/ops/release.md must include https://github.com/0disoft/clarissimi/pull/2.",
    "docs/ops/release.md must include a numeric propose fixture workflow run id.",
    "docs/ops/release.md must include a propose fixture workflow timestamp."
  ]);
});

test("release readiness rejects missing dry-run dogfood evidence", () => {
  const text = createReleaseEvidenceText()
    .replace("Current dry-run dogfood evidence: `Clarissimi dry run` workflow run", "")
    .replace("`29031384775` passed on `2026-07-09T15:54:58Z`", "passed")
    .replace("summary artifact validation", "summary output check");

  assert.deepEqual(validateDryRunDogfoodEvidence(text), [
    "docs/ops/release.md must include Current dry-run dogfood evidence: `Clarissimi dry run` workflow run.",
    "docs/ops/release.md must include summary artifact validation.",
    "docs/ops/release.md must include a numeric dry-run dogfood workflow run id.",
    "docs/ops/release.md must include a dry-run dogfood workflow timestamp."
  ]);
});

test("release readiness secret scan detects provider gateway env assignments", () => {
  const names = [
    ["CLARISSIMI", "PROVIDER", "TOKEN"],
    ["OPENCODE", "GO", "API", "KEY"],
    ["UMANS", "API", "KEY"],
    ["DEEPSEEK", "API", "KEY"],
    ["NODE", "AUTH", "TOKEN"],
    ["GITHUB", "PAT", "ODISOFT"]
  ].map((parts) => parts.join("_"));
  const text = names.map((name, index) =>
    index === 0 ? `${name} = synthetic-token` : `${name}=synthetic-token`
  ).join("\n");

  assert.deepEqual(findHighRiskSecretLines("sample.env", text), [
    "sample.env:1",
    "sample.env:2",
    "sample.env:3",
    "sample.env:4",
    "sample.env:5",
    "sample.env:6"
  ]);
});

test("release readiness secret scan allows documented secret names without assigned values", () => {
  const text = [
    "Set CLARISSIMI_PROVIDER_TOKEN in repository secrets.",
    "$env:OPENAI_API_KEY | gh secret set CLARISSIMI_PROVIDER_TOKEN --repo owner/repo --app actions",
    "Provider examples may mention OPENCODE_GO_API_KEY or UMANS_API_KEY by name."
  ].join("\n");

  assert.deepEqual(findHighRiskSecretLines("docs/ops/secrets.md", text), []);
});

test("release readiness accepts the Action manifest contract", () => {
  assert.deepEqual(validateActionManifestContract(createActionManifestText()), []);
});

test("release readiness rejects Action manifest input default drift and secret inputs", () => {
  const text = createActionManifestText()
    .replace("default: propose", "default: dry-run")
    .replace("  provider-model:", "  provider-token:\n    required: false\n  provider-model:");

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml input mode must set default: propose.",
    "action.yml must not expose provider-token as an action input."
  ]);
});

test("release readiness rejects Action manifest env and command drift", () => {
  const text = createActionManifestText()
    .replace("CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}", "CLARISSIMI_PROVIDER_TOKEN: ${{ inputs.provider-token }}")
    .replace("pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build", "pnpm --dir \"$GITHUB_ACTION_PATH\" build");

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml must include env mapping CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}.",
    "action.yml must run pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build."
  ]);
});

test("release readiness scopes Action manifest input and output checks to their sections", () => {
  const missingInputMode = createActionManifestText()
    .replace("  mode:\n    required: false\n    default: propose\n", "");

  assert.deepEqual(validateActionManifestContract(missingInputMode), [
    "action.yml must define input mode."
  ]);

  const missingOutputMode = createActionManifestText()
    .replace("  mode:\n    value: ${{ steps.clarissimi.outputs.mode }}\n", "");

  assert.deepEqual(validateActionManifestContract(missingOutputMode), [
    "action.yml must define output mode."
  ]);
});

test("release readiness rejects Action manifest output value drift", () => {
  const text = createActionManifestText()
    .replace(
      "value: ${{ steps.clarissimi.outputs.proposal-pull-request-url }}",
      "value: ${{ steps.clarissimi.outputs.proposal-url }}"
    );

  assert.deepEqual(validateActionManifestContract(text), [
    "action.yml output proposal-pull-request-url must map to ${{ steps.clarissimi.outputs.proposal-pull-request-url }}."
  ]);
});

test("release readiness accepts the CI workflow contract", () => {
  assert.deepEqual(validateCiWorkflowContract(createCiWorkflowText()), []);
});

test("release readiness accepts safe workflow trust boundaries", () => {
  assert.deepEqual(
    validateWorkflowTrustBoundaryContract(createCiWorkflowText(), ".github/workflows/ci.yml"),
    []
  );
});

test("release readiness rejects pull_request_target and broad workflow permissions", () => {
  const text = [
    "name: Risky",
    "on:",
    "  pull_request_target:",
    "permissions: write-all",
    ""
  ].join("\n");

  assert.deepEqual(validateWorkflowTrustBoundaryContract(text, ".github/workflows/risky.yml"), [
    ".github/workflows/risky.yml must not include pull_request_target:.",
    ".github/workflows/risky.yml must not include write-all."
  ]);
});

test("release readiness rejects workflows without explicit permissions", () => {
  const text = [
    "name: Missing permissions",
    "on:",
    "  workflow_dispatch:",
    "jobs:",
    "  validation:",
    "    runs-on: ubuntu-latest",
    ""
  ].join("\n");

  assert.deepEqual(validateWorkflowTrustBoundaryContract(text, ".github/workflows/missing-permissions.yml"), [
    ".github/workflows/missing-permissions.yml must include permissions:."
  ]);
});

test("release readiness rejects CI workflow command drift", () => {
  const text = createCiWorkflowText()
    .replace("pnpm run release-readiness", "pnpm run docs")
    .replace("pnpm run lint", "pnpm run typecheck")
    .replace("pnpm run contract", "pnpm run check");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must run pnpm run release-readiness.",
    ".github/workflows/ci.yml must run pnpm run lint.",
    ".github/workflows/ci.yml must run pnpm run contract."
  ]);
});

test("release readiness rejects CI workflow trigger and permission drift", () => {
  const text = createCiWorkflowText()
    .replace("pull_request:", "pull-request:")
    .replace("contents: read", "contents: write");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must define pull_request: trigger.",
    ".github/workflows/ci.yml must set contents: read."
  ]);
});

test("release readiness rejects CI runtime and tool pin drift", () => {
  const text = createCiWorkflowText()
    .replace("node-version: 24", "node-version: 26")
    .replace("SSEALED_VERSION: 0.6.8", "SSEALED_VERSION: latest")
    .replace("sha256sum --check -", "true");

  assert.deepEqual(validateCiWorkflowContract(text), [
    ".github/workflows/ci.yml must include SSEALED_VERSION: 0.6.8.",
    ".github/workflows/ci.yml must include node-version: 24.",
    ".github/workflows/ci.yml must include sha256sum --check -."
  ]);
});

test("release readiness accepts dogfood workflow contracts", () => {
  assert.deepEqual(validateDogfoodWorkflowContract(createDryRunWorkflowText(), dogfoodWorkflowContracts[0]), []);
  assert.deepEqual(validateDogfoodWorkflowContract(createProposeWorkflowText(), dogfoodWorkflowContracts[1]), []);
  assert.deepEqual(validateDogfoodWorkflowContract(createStageDraftWorkflowText(), dogfoodWorkflowContracts[2]), []);
});

test("release readiness rejects dry-run dogfood write permission drift", () => {
  const text = createDryRunWorkflowText().replace("contents: read", "contents: write");

  assert.deepEqual(validateDogfoodWorkflowContract(text, dogfoodWorkflowContracts[0]), [
    ".github/workflows/clarissimi-dry-run.yml must include contents: read.",
    ".github/workflows/clarissimi-dry-run.yml must not include contents: write."
  ]);
});

test("release readiness rejects propose and stage-draft dogfood drift", () => {
  const proposeText = createProposeWorkflowText()
    .replace("mode: propose", "mode: dry-run")
    .replace("github-fixture: fixtures/github-merged-pr-approved.json", "github-fixture: fixtures/github-merged-pr-basic.json");

  assert.deepEqual(validateDogfoodWorkflowContract(proposeText, dogfoodWorkflowContracts[1]), [
    ".github/workflows/clarissimi-propose-fixture.yml must include mode: propose.",
    ".github/workflows/clarissimi-propose-fixture.yml must include github-fixture: fixtures/github-merged-pr-approved.json."
  ]);

  const stageDraftText = createStageDraftWorkflowText()
    .replace("mode: stage-draft", "mode: propose")
    .replace("test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"", "test \"${{ steps.stage.outputs.staged-file-count }}\" = \"4\"");

  assert.deepEqual(validateDogfoodWorkflowContract(stageDraftText, dogfoodWorkflowContracts[2]), [
    ".github/workflows/clarissimi-stage-draft-fixture.yml must include mode: stage-draft.",
    ".github/workflows/clarissimi-stage-draft-fixture.yml must include test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"."
  ]);
});

test("release readiness accepts the hosted live provider workflow contract", () => {
  assert.deepEqual(validateHostedLiveProviderWorkflowContract(createHostedWorkflowText()), []);
});

test("release readiness rejects hosted live provider workflow input drift", () => {
  const text = createHostedWorkflowText()
    .replace("provider-model:", "model-name:")
    .replace("required: false", "required: true");

  assert.deepEqual(validateHostedLiveProviderWorkflowContract(text), [
    ".github/workflows/clarissimi-live-provider-smoke.yml must define workflow_dispatch input provider-model.",
    ".github/workflows/clarissimi-live-provider-smoke.yml input provider-endpoint must set required: false."
  ]);
});

test("release readiness rejects hosted live provider workflow secret and command drift", () => {
  const text = createHostedWorkflowText()
    .replaceAll("CLARISSIMI_PROVIDER_TOKEN", "RENAMED_PROVIDER_TOKEN")
    .replace("pnpm run live-provider-smoke", "pnpm run smoke");

  assert.deepEqual(validateHostedLiveProviderWorkflowContract(text), [
    ".github/workflows/clarissimi-live-provider-smoke.yml must read secrets.CLARISSIMI_PROVIDER_TOKEN.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must run pnpm run live-provider-smoke."
  ]);
});

test("release readiness rejects hosted live provider trigger, permission, and preflight drift", () => {
  const text = createHostedWorkflowText()
    .replace("  workflow_dispatch:", "  push:")
    .replace("contents: read", "contents: write")
    .replace(
      [
        "      - name: Verify provider secret",
        "        env:",
        "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
        "        run: test -n \"${CLARISSIMI_PROVIDER_TOKEN}\"",
        "",
        "      - name: Checkout repository",
        "        uses: actions/checkout@v7"
      ].join("\n"),
      [
        "      - name: Checkout repository",
        "        uses: actions/checkout@v7",
        "",
        "      - name: Verify provider secret",
        "        env:",
        "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
        "        run: test -n \"${CLARISSIMI_PROVIDER_TOKEN}\""
      ].join("\n")
    );

  assert.deepEqual(validateHostedLiveProviderWorkflowContract(text), [
    ".github/workflows/clarissimi-live-provider-smoke.yml must include workflow_dispatch:.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must include contents: read.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must not include push:.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must not include contents: write.",
    ".github/workflows/clarissimi-live-provider-smoke.yml must keep Checkout repository after the previous release-check step."
  ]);
});

function createValidScripts() {
  const scripts = {
    format: "node -e \"console.error('format is not configured. Configure this validation before relying on pnpm run format.'); process.exit(1)\"",
    "migration-check": "node -e \"console.error('migration-check is not configured. Configure this validation before relying on pnpm run migration-check.'); process.exit(1)\"",
    test: `node --test ${requiredTestGlobs.join(" ")}`
  };

  for (const script of requiredPackageScripts) {
    scripts[script.name] = script.includes.join(" && ");
  }

  scripts.check = "pnpm run typecheck && pnpm run test";
  scripts.contract = "pnpm run typecheck && pnpm run test";

  return scripts;
}

function createSmokeScriptText() {
  return [
    "async function assertWorkspacePackagePackDryRuns() {",
    "  const packages = [",
    "    { dir: \"schemas\" },",
    "    { dir: \"redaction\" },",
    "    { dir: \"core\" },",
    "    { dir: \"github\" },",
    "    { dir: \"providers\" },",
    "    { dir: \"renderers\" },",
    "    { dir: \"cli\", requiredFiles: [\"dist/bin/clarissimi.js\"] },",
    "    { dir: \"action\", requiredFiles: [\"dist/bin/clarissimi-action.js\"] }",
    "  ];",
    "  await runJsonCommand({",
    "    command: \"pnpm\",",
    "    args: [\"--filter\", \"@clarissimi/schemas\", \"pack\", \"--dry-run\", \"--json\"]",
    "  });",
    "}",
    "function validatePackagePackDryRun(output, packageInfo) {",
    "  const requiredFiles = [",
    "    \"package.json\",",
    "    \"README.md\",",
    "    \"LICENSE\",",
    "    \"dist/index.js\",",
    "    \"dist/index.d.ts\"",
    "  ];",
    "  if (",
    "    path === \"tsconfig.json\"",
    "    || path.startsWith(\"src/\")",
    "    || path.startsWith(\"test/\")",
    "    || path.includes(\"node_modules/\")",
    "    || path.endsWith(\".tsbuildinfo\")",
    "  ) {",
    "    throw new Error(\"bad pack file\");",
    "  }",
    "}",
    ""
  ].join("\n");
}

function createBlockedReleasePackageJson() {
  return {
    private: packageReleasePolicy.private,
    version: packageReleasePolicy.version
  };
}

function createReleasePolicyText() {
  return [
    "Clarissimi is not ready for public package publication.",
    "A versioned Action tag remain blocked until maintainers accept a release ADR or update this operational contract.",
    "The current root package stays private at `0.0.0`.",
    "Do not bump versions, publish packages, or create",
    "release tags as part of ordinary implementation work.",
    "",
    "- Public package publication: blocked.",
    "- Versioned GitHub Action tag: blocked.",
    "",
    "Public package publication and versioned Action tags require:",
    "public product-positioning guardrails",
    "intentionally fail-closed `format` and `migration-check`",
    "",
    "- Release blocker status: public package publication and versioned Action tags are blocked",
    ""
  ].join("\n");
}

function createProductPositioningTexts() {
  return {
    "README.md": [
      "Clarissimi is a maintainer-approved contribution recognition engine for open-source repositories.",
      "Clarissimi is not a contributor scoring leaderboard, an HR scorecard, or an AI code review tool.",
      "AI is used as a drafter that reads repository evidence and prepares a structured recognition draft.",
      "Maintainers remain the approval authority.",
      "Public output should read like contribution history, not a scoreboard.",
      ""
    ].join("\n"),
    "docs/product/02-spec.md": [
      "Clarissimi must be described as a contribution recognition engine.",
      "Do not describe it as:",
      "- contributor scoring",
      "- contributor ranking",
      "- a public leaderboard",
      "Public output must not show a contributor's percentage share of recent total impact weight, score,",
      "Clarissimi may expose this kind of metric only through a",
      "maintainer-only analytics view unless a future ADR accepts a safer public framing.",
      ""
    ].join("\n")
  };
}

function createCiOperationalDocumentText() {
  return [
    "The hosted CI workflow `.github/workflows/ci.yml` runs on `push` to `main`, `pull_request`, and",
    "manual dispatch. It uses read-only repository permissions and runs `docs`, `release-readiness`,",
    "`lint`, `smoke`, `check`, and `contract` with Node.js 24 and the package-manager version declared",
    "by `package.json`.",
    "",
    "The `main` branch is protected and requires the `Validation` check from `.github/workflows/ci.yml`",
    "to pass with strict up-to-date status checks. Administrator enforcement is disabled so repository",
    "owners can recover from CI or protection misconfiguration without changing the branch rule first.",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createOperationalContractDocumentText() {
  return [
    "- Correctness gate: `pnpm run docs`, `pnpm run release-readiness`, `pnpm run lint`,",
    "  `pnpm run smoke`, `pnpm run check`, and `pnpm run contract` must pass before source-only merges.",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createObservabilityDocumentText() {
  return [
    "- hosted CI run status for `docs`, `release-readiness`, `lint`, `smoke`, `check`, and `contract`",
    "",
    "Health checks:",
    "",
    "- `pnpm run docs`",
    "- `pnpm run release-readiness`",
    "- `pnpm run lint`",
    "- `pnpm run smoke`",
    "- `pnpm run check`",
    "- `pnpm run contract`",
    "",
    "## Validation",
    "",
    "- Required validation names: `docs`, `release-readiness`, `lint`, `smoke`, `check`, `contract`",
    ""
  ].join("\n");
}

function createWorkspacePackageManifest(packageDir = "schemas") {
  return {
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        default: "./dist/index.js"
      }
    },
    files: ["dist"],
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/0disoft/clarissimi.git",
      directory: `packages/${packageDir}`
    },
    homepage: "https://github.com/0disoft/clarissimi#readme",
    bugs: {
      url: "https://github.com/0disoft/clarissimi/issues"
    },
    engines: {
      node: ">=24"
    },
    scripts: {
      build: "tsc -b",
      typecheck: "tsc -b --pretty false"
    }
  };
}

function createPackageOwnershipText() {
  return [
    "# Package Ownership",
    "",
    "## Package Table",
    "",
    "| Package | Status | Owns | Must Not Own |",
    "| --- | --- | --- | --- |",
    "| `packages/cli` | Implemented | CLI orchestration | Domain policy |",
    "| `packages/schemas` | Implemented | Shared schema vocabulary | CLI orchestration |",
    "",
    "## Internal Dependency Graph",
    "",
    "| Package | Allowed internal dependencies |",
    "| --- | --- |",
    "| `packages/cli` | `@clarissimi/schemas` |",
    "| `packages/schemas` | none |",
    ""
  ].join("\n");
}

function createReleaseEvidenceText() {
  return [
    "Current dry-run dogfood evidence: `Clarissimi dry run` workflow run",
    "`29031384775` passed on `2026-07-09T15:54:58Z` at",
    "`77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb` and exercised summary artifact validation.",
    "Current dogfood evidence: `Clarissimi propose fixture` workflow run",
    "`29027800039` passed on `2026-07-09T15:02:15Z` and created proposal pull request",
    "https://github.com/0disoft/clarissimi/pull/1.",
    "Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run",
    "`29027802451` passed on `2026-07-09T15:02:10Z` and created draft review pull request",
    "https://github.com/0disoft/clarissimi/pull/2.",
    "Current live-provider evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials and `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`.",
    "Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=minimax-m3`.",
    "Current UMANS evidence: local `pnpm run live-provider-smoke` passed on `2026-07-09`",
    "using maintainer-owned provider credentials, `CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2`.",
    "Current hosted live-provider evidence: `Clarissimi live provider smoke` workflow run",
    "`29018826925` passed on `2026-07-09T12:39:17Z` using repository secret `CLARISSIMI_PROVIDER_TOKEN`",
    "and dispatch input `CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini`."
  ].join("\n");
}

function createRollbackProcedureText() {
  return [
    "# Rollback",
    "",
    "| State | Rollback action |",
    "| --- | --- |",
    "| Temporary staging output only | Delete the temporary staging directory. |",
    "| Local proposal branch only | Delete the local `clarissimi/recognition/<source-kind>-<source-id>` branch. |",
    "| Published proposal branch without pull request | Delete the remote proposal branch. |",
    "| Open proposal pull request before merge | Close the proposal pull request and delete the proposal branch. |",
    "| Merged recognition pull request | Revert the recognition pull request and run the rebuild path for derived outputs. |",
    "",
    "```powershell",
    "git branch --delete clarissimi/recognition/<source-kind>-<source-id>",
    "git push origin --delete clarissimi/recognition/<source-kind>-<source-id>",
    "```",
    "",
    "After the revert lands, regenerate derived outputs with the configured rebuild command.",
    "",
    "No database rollback exists in the MVP.",
    "",
    "- `.clarissimi/contributions.jsonl`",
    "",
    "Derived files should be regenerated from approved contribution records instead of hand-edited during rollback.",
    ""
  ].join("\n");
}

function createActionManifestText() {
  return [
    "name: Clarissimi",
    "inputs:",
    "  mode:",
    "    required: false",
    "    default: propose",
    "  event-path:",
    "    required: false",
    "  github-fixture:",
    "    required: false",
    "  config-path:",
    "    required: false",
    "  base-branch:",
    "    required: false",
    "    default: main",
    "  remote-name:",
    "    required: false",
    "    default: origin",
    "  staging-dir:",
    "    required: false",
    "  summary-path:",
    "    required: false",
    "  provider:",
    "    required: false",
    "  provider-model:",
    "    required: false",
    "  provider-endpoint:",
    "    required: false",
    "  provider-thinking:",
    "    required: false",
    "outputs:",
    "  draft-count:",
    "    value: ${{ steps.clarissimi.outputs.draft-count }}",
    "  proposed-entry-count:",
    "    value: ${{ steps.clarissimi.outputs.proposed-entry-count }}",
    "  skipped-entry-count:",
    "    value: ${{ steps.clarissimi.outputs.skipped-entry-count }}",
    "  mode:",
    "    value: ${{ steps.clarissimi.outputs.mode }}",
    "  input-source:",
    "    value: ${{ steps.clarissimi.outputs.input-source }}",
    "  approval-status:",
    "    value: ${{ steps.clarissimi.outputs.approval-status }}",
    "  redaction-match-count:",
    "    value: ${{ steps.clarissimi.outputs.redaction-match-count }}",
    "  staged-file-count:",
    "    value: ${{ steps.clarissimi.outputs.staged-file-count }}",
    "  proposal-branch:",
    "    value: ${{ steps.clarissimi.outputs.proposal-branch }}",
    "  proposal-commit-sha:",
    "    value: ${{ steps.clarissimi.outputs.proposal-commit-sha }}",
    "  proposal-pull-request-number:",
    "    value: ${{ steps.clarissimi.outputs.proposal-pull-request-number }}",
    "  proposal-pull-request-url:",
    "    value: ${{ steps.clarissimi.outputs.proposal-pull-request-url }}",
    "  proposal-pull-request-action:",
    "    value: ${{ steps.clarissimi.outputs.proposal-pull-request-action }}",
    "  summary-json-path:",
    "    value: ${{ steps.clarissimi.outputs.summary-json-path }}",
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Run Clarissimi",
    "      env:",
    "        GITHUB_TOKEN: ${{ (inputs.mode == 'propose' || inputs.mode == 'stage-draft') && github.token || '' }}",
    "        INPUT_MODE: ${{ inputs.mode }}",
    "        INPUT_EVENT_PATH: ${{ inputs.event-path }}",
    "        INPUT_GITHUB_FIXTURE: ${{ inputs.github-fixture }}",
    "        INPUT_CONFIG_PATH: ${{ inputs.config-path }}",
    "        INPUT_BASE_BRANCH: ${{ inputs.base-branch }}",
    "        INPUT_REMOTE_NAME: ${{ inputs.remote-name }}",
    "        INPUT_STAGING_DIR: ${{ inputs.staging-dir }}",
    "        INPUT_SUMMARY_PATH: ${{ inputs.summary-path }}",
    "        INPUT_PROVIDER: ${{ inputs.provider }}",
    "        INPUT_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "        INPUT_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "        INPUT_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        CLARISSIMI_PROVIDER_TOKEN: ${{ env.CLARISSIMI_PROVIDER_TOKEN }}",
    "      run: |",
    "        pnpm --dir \"$GITHUB_ACTION_PATH\" install --frozen-lockfile",
    "        pnpm --dir \"$GITHUB_ACTION_PATH\" --filter @clarissimi/action build",
    "        node \"$GITHUB_ACTION_PATH/packages/action/dist/bin/clarissimi-action.js\""
  ].join("\n");
}

function createCiWorkflowText() {
  return [
    "name: CI",
    "",
    "env:",
    "  ACTIONLINT_LINUX_AMD64_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    "  ACTIONLINT_VERSION: 1.7.12",
    "  SSEALED_VERSION: 0.6.8",
    "  YQ_LINUX_AMD64_SHA256: fa52a4e758c63d38299163fbdd1edfb4c4963247918bf9c1c5d31d84789eded4",
    "  YQ_VERSION: 4.53.3",
    "",
    "on:",
    "  push:",
    "    branches:",
    "      - main",
    "  pull_request:",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  validation:",
    "    steps:",
    "      - run: pnpm install --frozen-lockfile",
    "      - uses: actions/setup-node@v6",
    "        with:",
    "          node-version: 24",
    "      - run: corepack enable",
    "      - run: |",
    "          npm install --global \"ssealed@${SSEALED_VERSION}\"",
    "          sha256sum --check -",
    "      - run: pnpm run docs",
    "      - run: pnpm run release-readiness",
    "      - run: pnpm run lint",
    "      - run: pnpm run smoke",
    "      - run: pnpm run check",
    "      - run: pnpm run contract"
  ].join("\n");
}

function createDryRunWorkflowText() {
  return [
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "steps:",
    "  - uses: ./",
    "    with:",
    "      mode: dry-run",
    "      github-fixture: fixtures/github-merged-pr-basic.json",
    "      summary-path: .clarissimi/dogfood-fixture-summary.json",
    "  - run: |",
    "      test \"${{ steps.fixture.outputs.mode }}\" = \"dry-run\"",
    "      test \"${{ steps.fixture.outputs.input-source }}\" = \"github_fixture\"",
    "      test -n \"${{ steps.fixture.outputs.summary-json-path }}\"",
    "      test -f \"${{ steps.fixture.outputs.summary-json-path }}\"",
    "      Summary artifact leaked raw fixture evidence.",
    "  - uses: ./",
    "    with:",
    "      mode: dry-run",
    "      event-path: fixtures/github-pull-request-merged-event.json",
    "  - run: |",
    "      test \"${{ steps.event.outputs.mode }}\" = \"dry-run\"",
    "      test \"${{ steps.event.outputs.input-source }}\" = \"github_event_path\""
  ].join("\n");
}

function createProposeWorkflowText() {
  return [
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: write",
    "  pull-requests: write",
    "  issues: read",
    "steps:",
    "  - uses: actions/checkout@v7",
    "    with:",
    "      fetch-depth: 0",
    "  - uses: ./",
    "    with:",
    "      mode: propose",
    "      github-fixture: fixtures/github-merged-pr-approved.json",
    "      base-branch: ${{ inputs.base-branch }}",
    "  - run: |",
    "      test \"${{ steps.propose.outputs.proposed-entry-count }}\" = \"1\"",
    "      test \"${{ steps.propose.outputs.mode }}\" = \"propose\"",
    "      test \"${{ steps.propose.outputs.approval-status }}\" = \"approved\"",
    "      test \"${{ steps.propose.outputs.staged-file-count }}\" = \"4\"",
    "      test -n \"${{ steps.propose.outputs.proposal-pull-request-url }}\""
  ].join("\n");
}

function createStageDraftWorkflowText() {
  return [
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: write",
    "  pull-requests: write",
    "  issues: read",
    "steps:",
    "  - uses: actions/checkout@v7",
    "    with:",
    "      fetch-depth: 0",
    "  - uses: ./",
    "    with:",
    "      mode: stage-draft",
    "      github-fixture: fixtures/github-merged-pr-basic.json",
    "      base-branch: ${{ inputs.base-branch }}",
    "  - run: |",
    "      test \"${{ steps.stage.outputs.proposed-entry-count }}\" = \"0\"",
    "      test \"${{ steps.stage.outputs.mode }}\" = \"stage-draft\"",
    "      test \"${{ steps.stage.outputs.approval-status }}\" = \"draft\"",
    "      test \"${{ steps.stage.outputs.staged-file-count }}\" = \"1\"",
    "      test -n \"${{ steps.stage.outputs.proposal-pull-request-url }}\""
  ].join("\n");
}

function createHostedWorkflowText() {
  return [
    "name: Clarissimi live provider smoke",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      provider-model:",
    "        description: OpenAI-compatible model name for the smoke run.",
    "        required: true",
    "      provider-endpoint:",
    "        description: Optional OpenAI-compatible chat completions endpoint override.",
    "        required: false",
    "      provider-thinking:",
    "        description: Optional OpenAI-compatible thinking mode.",
    "        required: false",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  live-provider-smoke:",
    "    steps:",
    "      - name: Verify provider inputs",
    "        env:",
    "          CLARISSIMI_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "          CLARISSIMI_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "          CLARISSIMI_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        run: |",
    "          test -n \"${CLARISSIMI_PROVIDER_MODEL}\"",
    "",
    "      - name: Verify provider secret",
    "        env:",
    "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
    "        run: test -n \"${CLARISSIMI_PROVIDER_TOKEN}\"",
    "",
    "      - name: Checkout repository",
    "        uses: actions/checkout@v7",
    "",
    "      - name: Set up Node.js",
    "        uses: actions/setup-node@v6",
    "        with:",
    "          node-version: 24",
    "",
    "      - name: Enable Corepack",
    "        run: corepack enable",
    "",
    "      - name: Install dependencies",
    "        run: pnpm install --frozen-lockfile",
    "",
    "      - name: Run live provider smoke",
    "        env:",
    "          CLARISSIMI_PROVIDER_TOKEN: ${{ secrets.CLARISSIMI_PROVIDER_TOKEN }}",
    "          CLARISSIMI_PROVIDER_MODEL: ${{ inputs.provider-model }}",
    "          CLARISSIMI_PROVIDER_ENDPOINT: ${{ inputs.provider-endpoint }}",
    "          CLARISSIMI_PROVIDER_THINKING: ${{ inputs.provider-thinking }}",
    "        run: pnpm run live-provider-smoke"
  ].join("\n");
}
