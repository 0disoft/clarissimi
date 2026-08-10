import { findYamlMappingBlock, findYamlScalarValue } from "./yaml-contract.mjs";

export function validateHostedLiveProviderWorkflowContract(text, contract) {
  const issues = [];

  for (const input of contract.requiredInputs) {
    const block = findYamlMappingBlock(text, input.name);
    if (block === undefined) {
      issues.push(`${contract.path} must define workflow_dispatch input ${input.name}.`);
      continue;
    }

    const requiredValue = findYamlScalarValue(block, "required");
    const expected = String(input.required);
    if (requiredValue !== expected) {
      issues.push(`${contract.path} input ${input.name} must set required: ${expected}.`);
    }
  }

  if (!text.includes(`secrets.${contract.secretName}`)) {
    issues.push(`${contract.path} must read secrets.${contract.secretName}.`);
  }

  if (!text.includes(contract.runCommand)) {
    issues.push(`${contract.path} must run ${contract.runCommand}.`);
  }

  issues.push(...validateRequiredAndForbiddenSnippets(text, contract));
  issues.push(...validateSnippetOrder(text, contract.path, contract.requiredOrder));

  return issues;
}

export function validateWorkflowTrustBoundaryContract(text, path, contract) {
  return validateRequiredAndForbiddenSnippets(text, { ...contract, path });
}

export function validateCiWorkflowContract(text, contract) {
  const issues = [];

  for (const trigger of contract.requiredTriggers) {
    if (!text.includes(trigger)) {
      issues.push(`${contract.path} must define ${trigger} trigger.`);
    }
  }

  for (const permission of contract.requiredPermissions) {
    if (!text.includes(permission)) {
      issues.push(`${contract.path} must set ${permission}.`);
    }
  }

  for (const command of contract.requiredCommands) {
    if (!text.includes(command)) {
      issues.push(`${contract.path} must run ${command}.`);
    }
  }

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateToolchainPlatformSmokeWorkflowContract(text, contract) {
  return validateRequiredAndForbiddenSnippets(text, contract);
}

export function validateNpmPublishWorkflowContract(text, contract) {
  return validateRequiredAndForbiddenSnippets(text, contract);
}

export function validateDogfoodWorkflowContract(text, contract) {
  return validateRequiredAndForbiddenSnippets(text, {
    ...contract,
    forbiddenSnippets: contract.forbiddenSnippets ?? [],
  });
}

function validateRequiredAndForbiddenSnippets(text, contract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  for (const snippet of contract.forbiddenSnippets) {
    if (text.includes(snippet)) {
      issues.push(`${contract.path} must not include ${snippet}.`);
    }
  }

  return issues;
}

function validateSnippetOrder(text, path, snippets) {
  const issues = [];
  let cursor = -1;

  for (const snippet of snippets) {
    const next = text.indexOf(snippet);
    if (next === -1) {
      continue;
    }

    if (next <= cursor) {
      issues.push(`${path} must keep ${snippet} after the previous release-check step.`);
      continue;
    }

    cursor = next;
  }

  return issues;
}
