import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { requiredDocumentationPaths, validateDocs } from "../validate-docs.mjs";
import { validateContributionAssessment } from "../../packages/schemas/dist/index.js";

test("validateDocs accepts required docs, local links, and fenced JSON examples", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: [
      "# Fixture",
      "",
      "[Guide](docs/guide.md)",
      "",
      "```json",
      "{\"ok\": true}",
      "```",
      ""
    ].join("\n"),
    guide: "# Guide\n"
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.markdownFileCount >= 2, true);
});

test("validateDocs rejects invalid fenced JSON examples", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: [
      "# Fixture",
      "",
      "```json",
      "{\"ok\": true,}",
      "```",
      ""
    ].join("\n")
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) =>
      issue.startsWith("README.md has invalid json code block 1:")
    ),
    true
  );
});

test("validateDocs rejects missing local markdown links", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: "# Fixture\n\n[Missing](docs/missing.md)\n"
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes("README.md links to missing local target: docs/missing.md"),
    true
  );
});

test("agent-assisted draft guide JSON examples match the assessment schema", async () => {
  const guideText = await readFile(join(process.cwd(), "docs", "cli", "agent-assisted-drafts.md"), "utf8");
  const examples = extractJsonCodeBlocks(guideText).map((block) => JSON.parse(block));

  assert.equal(examples.length, 2);

  const assessment = examples[0];
  const assessmentResult = validateContributionAssessment(assessment);
  assert.equal(assessmentResult.ok, true, JSON.stringify(assessmentResult.issues));
  assert.equal(assessment.source.pullRequestNumber, 42);
  assert.equal(assessment.evidenceRefs[0].url, "https://github.com/example/project/pull/42");
  assert.equal(Object.hasOwn(assessment, "score"), false);
  assert.equal(Object.hasOwn(assessment, "averageScore"), false);

  const envelope = examples[1];
  assert.equal(envelope.schemaVersion, "clarissimi.draft-envelope/v1");
  assert.equal(envelope.draftProvenance.delegatedModel, "example-model");
  const envelopeAssessmentResult = validateContributionAssessment(envelope.assessment);
  assert.equal(envelopeAssessmentResult.ok, true, JSON.stringify(envelopeAssessmentResult.issues));
  assert.equal(Object.hasOwn(envelope.assessment, "score"), false);
  assert.equal(Object.hasOwn(envelope.assessment, "averageScore"), false);
});

async function createDocsFixture(options) {
  const repoRoot = await mkdtemp(join(tmpdir(), "clarissimi-docs-validation-"));
  await writeRequiredFiles(repoRoot);
  await mkdir(join(repoRoot, "docs"), { recursive: true });
  await writeFile(join(repoRoot, "README.md"), options.readme, "utf8");

  if (options.guide !== undefined) {
    await writeFile(join(repoRoot, "docs", "guide.md"), options.guide, "utf8");
  }

  return repoRoot;
}

async function writeRequiredFiles(repoRoot) {
  for (const path of requiredDocumentationPaths) {
    const target = join(repoRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, stubContentForPath(path), "utf8");
  }
}

function stubContentForPath(path) {
  if (path.endsWith(".md")) {
    return `# ${path}\n`;
  }

  if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    return "name: fixture\n";
  }

  if (path.endsWith(".json")) {
    return "{}\n";
  }

  return "#!/usr/bin/env node\n";
}

function extractJsonCodeBlocks(text) {
  const blocks = [];
  const pattern = /```json\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
}
