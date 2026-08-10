export const credentialedReleaseEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Current live-provider evidence: local `pnpm run live-provider-smoke` passed",
    "CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini",
    "Current OpenCode Go evidence: local `pnpm run live-provider-smoke` passed",
    "CLARISSIMI_PROVIDER_MODEL=minimax-m3",
    "Current UMANS evidence: local `pnpm run live-provider-smoke` passed",
    "CLARISSIMI_PROVIDER_MODEL=umans-glm-5.2",
    "Recent hosted live-provider evidence: `Clarissimi live provider smoke` workflow run",
    "CLARISSIMI_PROVIDER_TOKEN",
    "CLARISSIMI_PROVIDER_MODEL=gpt-4.1-mini",
    "`pnpm run hosted-live-provider-smoke -- --model <provider-model>`",
    "attach the final run URL outside the repository commit",
  ],
  requiredPatterns: [
    {
      description: "a numeric hosted live-provider workflow run id",
      pattern: /Recent hosted live-provider evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a hosted live-provider workflow timestamp",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
    {
      description: "a hosted live-provider validated source commit SHA",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*validated source commit[\s\S]*`[0-9a-f]{40}`/,
    },
    {
      description: "a hosted live-provider workflow run URL",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*Run URL:\s*`https:\/\/github\.com\/0disoft\/clarissimi\/actions\/runs\/[0-9]{8,}`\.[\s\S]*Refresh this evidence/,
    },
    {
      description: "a hosted live-provider release-candidate refresh command",
      pattern:
        /Recent hosted live-provider evidence:[\s\S]*Refresh this evidence[\s\S]*`pnpm run hosted-live-provider-smoke -- --model <provider-model>`[\s\S]*for the exact[\s\S]*release-candidate commit[\s\S]*attach[\s\S]*outside the repository commit/,
    },
  ],
};

export const writeModeDogfoodEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Current dogfood evidence: `Clarissimi propose fixture` workflow run",
    "Current draft dogfood evidence: `Clarissimi stage draft fixture` workflow run",
    "https://github.com/0disoft/clarissimi/actions/runs/29027800039",
    "https://github.com/0disoft/clarissimi/actions/runs/29027802451",
    "https://github.com/0disoft/clarissimi/pull/1",
    "https://github.com/0disoft/clarissimi/pull/2",
    "Fixture-only cleanup:",
    "pull request `#1` was closed after evidence capture",
    "pull request `#2` was closed after evidence capture",
    "clarissimi/recognition/merged_pull_request-42",
    "clarissimi/drafts/merged_pull_request-42",
    "not intended to merge into the real repository ledger",
    "not intended to merge into the real repository draft inbox",
  ],
  requiredPatterns: [
    {
      description: "a numeric propose fixture workflow run id",
      pattern: /Current dogfood evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a propose fixture workflow timestamp",
      pattern: /Current dogfood evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
    {
      description: "a numeric stage-draft fixture workflow run id",
      pattern: /Current draft dogfood evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a stage-draft fixture workflow timestamp",
      pattern:
        /Current draft dogfood evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
  ],
};

export const dryRunDogfoodEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Current dry-run dogfood evidence: `Clarissimi dry run` workflow run",
    "summary artifact validation",
    "77f3fcbbeb25e3338ee2a4bba3c8efbfc46e5cfb",
    "https://github.com/0disoft/clarissimi/actions/runs/29031384775",
  ],
  requiredPatterns: [
    {
      description: "a numeric dry-run dogfood workflow run id",
      pattern: /Current dry-run dogfood evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a dry-run dogfood workflow timestamp",
      pattern:
        /Current dry-run dogfood evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
  ],
};

export const hostedCiEvidenceContract = {
  path: "docs/ops/release.md",
  requiredSnippets: [
    "Recent hosted CI validation evidence: `CI` workflow run",
    "`release-readiness`, `lint`, `smoke`, `check`, and `contract`",
    "`pnpm run hosted-ci-validation` for the exact release-candidate commit",
    "attach the final run URL outside the repository commit",
  ],
  requiredPatterns: [
    {
      description: "a numeric hosted CI workflow run id",
      pattern: /Recent hosted CI validation evidence:[\s\S]*workflow run[\s\S]*`[0-9]{8,}`/,
    },
    {
      description: "a hosted CI workflow timestamp",
      pattern:
        /Recent hosted CI validation evidence:[\s\S]*passed on `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
    },
    {
      description: "a hosted CI validated source commit sha",
      pattern:
        /Recent hosted CI validation evidence:[\s\S]*validated source commit[\s\S]*`[0-9a-f]{40}`/,
    },
    {
      description: "a direct hosted CI workflow run URL",
      pattern:
        /Recent hosted CI validation evidence:[\s\S]*Run URL:\s*`https:\/\/github\.com\/0disoft\/clarissimi\/actions\/runs\/[0-9]{8,}`\.[\s\S]*Refresh this evidence[\s\S]*attach[\s\S]*outside the repository commit/,
    },
  ],
};

export function validateCredentialedReleaseEvidence(
  text,
  contract = credentialedReleaseEvidenceContract,
) {
  return validateReleaseEvidenceText(text, contract);
}

export function validateWriteModeDogfoodEvidence(
  text,
  contract = writeModeDogfoodEvidenceContract,
) {
  return validateReleaseEvidenceText(text, contract);
}

export function validateDryRunDogfoodEvidence(text, contract = dryRunDogfoodEvidenceContract) {
  return validateReleaseEvidenceText(text, contract);
}

export function validateHostedCiEvidence(text, contract = hostedCiEvidenceContract) {
  return validateReleaseEvidenceText(text, contract);
}

function validateReleaseEvidenceText(text, contract) {
  const issues = [];
  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }
  for (const requirement of contract.requiredPatterns) {
    if (!requirement.pattern.test(text)) {
      issues.push(`${contract.path} must include ${requirement.description}.`);
    }
  }
  return issues;
}
