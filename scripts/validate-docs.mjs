import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredPaths = [
  "README.md",
  "action.yml",
  "VALIDATION.md",
  "docs/product/04-implementation-tracker.md",
  "docs/github-action/README.md",
  "docs/github-action/action-contract.md",
  "docs/github-action/permissions.md",
  "docs/ops/ci.md",
  "docs/ops/release.md",
  ".github/workflows/clarissimi-dry-run.yml",
  ".github/workflows/clarissimi-propose-fixture.yml"
];

const markdownFiles = [
  ...await listMarkdownFiles(repoRoot, false),
  ...await listMarkdownFiles(join(repoRoot, "docs"), true),
  ...await listMarkdownFiles(join(repoRoot, ".agents"), true)
];
const issues = [];

for (const requiredPath of requiredPaths) {
  if (!existsSync(join(repoRoot, requiredPath))) {
    issues.push(`missing required documentation target: ${requiredPath}`);
  }
}

for (const filePath of markdownFiles) {
  const text = await readFile(filePath, "utf8");
  for (const link of extractMarkdownLinks(text)) {
    if (isExternalOrAnchor(link)) {
      continue;
    }

    const target = stripLinkSuffix(link);
    if (target.length === 0) {
      continue;
    }

    if (!localTargetExists(filePath, target)) {
      issues.push(`${toRepoPath(filePath)} links to missing local target: ${link}`);
    }
  }
}

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log(`docs validation passed (${markdownFiles.length} markdown files)`);

async function listMarkdownFiles(dir, recursive) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...await listMarkdownFiles(entryPath, true));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function extractMarkdownLinks(text) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    links.push(match[1]);
  }

  return links;
}

function isExternalOrAnchor(link) {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(link);
}

function stripLinkSuffix(link) {
  const withoutHash = link.split("#")[0];
  return decodeURIComponent(withoutHash).replace(/^<|>$/g, "");
}

function localTargetExists(markdownFile, target) {
  const candidates = [
    resolve(dirname(markdownFile), target),
    resolve(repoRoot, target)
  ];

  return candidates.some((candidate) => {
    if (!isInsideRepo(candidate)) {
      return false;
    }

    return existsSync(candidate);
  });
}

function isInsideRepo(path) {
  const relativePath = relative(repoRoot, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(`..${sep}`));
}

function toRepoPath(path) {
  return relative(repoRoot, path).replaceAll(sep, "/");
}
