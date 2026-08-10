export function validateRequiredDocumentSnippets(text, contract) {
  const issues = [];

  for (const snippet of contract.requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

export function validateRequiredAndForbiddenDocumentSnippets(text, contract) {
  const issues = validateRequiredDocumentSnippets(text, contract);

  for (const snippet of contract.forbiddenSnippets) {
    if (text.includes(snippet)) {
      issues.push(`${contract.path} must not include ${snippet}.`);
    }
  }

  return issues;
}

export function validateDocumentSetRequiredSnippets(textsByPath, contract, unreadableDescription) {
  const issues = [];

  for (const documentPath of contract.documents) {
    const text = textsByPath[documentPath];
    if (typeof text !== "string") {
      issues.push(`${documentPath} must be readable for ${unreadableDescription}.`);
      continue;
    }

    for (const snippet of contract.requiredSnippets) {
      if (!text.includes(snippet)) {
        issues.push(`${documentPath} must include ${snippet}.`);
      }
    }
  }

  return issues;
}

export function validateMarkdownTableDocumentSnippets(text, contract) {
  const issues = [];
  const normalizedTableRows = text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map(normalizeMarkdownTableRow);

  for (const snippet of contract.requiredSnippets) {
    const present = snippet.startsWith("|")
      ? normalizedTableRows.includes(normalizeMarkdownTableRow(snippet))
      : text.includes(snippet);
    if (!present) {
      issues.push(`${contract.path} must include ${snippet}.`);
    }
  }

  return issues;
}

function normalizeMarkdownTableRow(line) {
  return line
    .trim()
    .split("|")
    .map((cell) => cell.trim())
    .join(" | ");
}
