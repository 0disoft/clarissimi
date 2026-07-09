import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const requiredDocumentationPaths = [
  "README.md",
  "action.yml",
  "VALIDATION.md",
  "docs/cli/agent-assisted-drafts.md",
  "docs/product/04-implementation-tracker.md",
  "docs/github-action/README.md",
  "docs/github-action/action-contract.md",
  "docs/github-action/permissions.md",
  "docs/ops/ci.md",
  "docs/ops/release.md",
  "docs/ops/rollback.md",
  ".github/workflows/ci.yml",
  ".github/workflows/clarissimi-dry-run.yml",
  ".github/workflows/clarissimi-live-provider-smoke.yml",
  ".github/workflows/clarissimi-propose-fixture.yml",
  ".github/workflows/clarissimi-stage-draft-fixture.yml",
  "scripts/hosted-live-provider-smoke.mjs",
  "scripts/release-readiness.mjs"
];

export async function validateDocs(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const requiredPaths = options.requiredPaths ?? requiredDocumentationPaths;
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
    for (const block of extractJsonCodeBlocks(text)) {
      try {
        JSON.parse(block.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`${toRepoPath(repoRoot, filePath)} has invalid json code block ${block.index}: ${message}`);
      }
    }

    for (const link of extractMarkdownLinks(text)) {
      if (isExternalOrAnchor(link)) {
        continue;
      }

      const target = stripLinkSuffix(link);
      if (target.length === 0) {
        continue;
      }

      if (!localTargetExists(repoRoot, filePath, target)) {
        issues.push(`${toRepoPath(repoRoot, filePath)} links to missing local target: ${link}`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    markdownFileCount: markdownFiles.length
  };
}

export async function runValidateDocs(options = {}) {
  const result = await validateDocs(options);

  if (!result.ok) {
    console.error(result.issues.join("\n"));
    return 1;
  }

  console.log(`docs validation passed (${result.markdownFileCount} markdown files)`);
  return 0;
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runValidateDocs();
}

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

function extractJsonCodeBlocks(text) {
  const blocks = [];
  const pattern = /```json\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push({
      index: blocks.length + 1,
      value: match[1]
    });
  }

  return blocks;
}

function isExternalOrAnchor(link) {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(link);
}

function stripLinkSuffix(link) {
  const withoutHash = link.split("#")[0];
  return decodeURIComponent(withoutHash).replace(/^<|>$/g, "");
}

function localTargetExists(repoRoot, markdownFile, target) {
  const candidates = [
    resolve(dirname(markdownFile), target),
    resolve(repoRoot, target)
  ];

  return candidates.some((candidate) => {
    if (!isInsideRepo(repoRoot, candidate)) {
      return false;
    }

    return existsSync(candidate);
  });
}

function isInsideRepo(repoRoot, path) {
  const relativePath = relative(repoRoot, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(`..${sep}`));
}

function toRepoPath(repoRoot, path) {
  return relative(repoRoot, path).replaceAll(sep, "/");
}
