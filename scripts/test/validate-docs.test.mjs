import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  maintainedSourceTruthDocumentationPaths,
  requiredDocumentationPaths,
  validateDocs,
} from "../validate-docs.mjs";
import { validateContributionAssessment } from "../../packages/schemas/dist/index.js";

test("validateDocs accepts required docs, local links, and fenced JSON examples", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: [
      "# Fixture",
      "",
      "[Guide](docs/guide.md)",
      "",
      "```json",
      '{"ok": true}',
      "```",
      "",
    ].join("\n"),
    guide: "# Guide\n",
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
    readme: ["# Fixture", "", "```json", '{"ok": true,}', "```", ""].join("\n"),
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.startsWith("README.md has invalid json code block 1:")),
    true,
  );
});

test("validateDocs rejects missing local markdown links", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: "# Fixture\n\n[Missing](docs/missing.md)\n",
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes("README.md links to missing local target: docs/missing.md"),
    true,
  );
});

test("validateDocs rejects missing required documentation targets", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: "# Fixture\n",
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({
    repoRoot,
    requiredPaths: [
      "README.md",
      "docs/cli/agent-assisted-drafts.md",
      "docs/cli/missing-required.md",
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes("missing required documentation target: docs/cli/missing-required.md"),
    true,
  );
});

test("validateDocs requires maintained architecture and development source-of-truth documents", () => {
  for (const path of [
    ...maintainedSourceTruthDocumentationPaths,
    "SECURITY.md",
    "docs/cli/shell-completion.md",
  ]) {
    assert.equal(requiredDocumentationPaths.includes(path), true, `${path} must be required`);
  }
});

test("validateDocs rejects obvious scaffold placeholders in maintained source-of-truth docs", async (t) => {
  const repoRoot = await createDocsFixture({ readme: "# Fixture\n" });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  await writeFile(
    join(repoRoot, "DEVELOPMENT.md"),
    "# Development\n\n- Product decision: UNDECIDED\n",
    "utf8",
  );

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes(
      "DEVELOPMENT.md contains scaffold placeholder text matching \\bUNDECIDED\\b",
    ),
    true,
  );
});

test("validateDocs rejects stale public Action release documentation", async (t) => {
  const repoRoot = await createDocsFixture({ readme: "# Fixture\n" });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  const readmePath = join(repoRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, readme.replaceAll("v0.5.0", "v0.4.0"), "utf8");

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes(
      "README.md is missing current-state contract text: 0disoft/clarissimi@v0.5.0",
    ),
    true,
  );
});

test("validateDocs rejects stale gallery and supported-release lines", async (t) => {
  const repoRoot = await createDocsFixture({ readme: "# Fixture\n" });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  const readmePath = join(repoRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(
    readmePath,
    readme.replace(
      "`gallery` is available in the current immutable `v0.5.0` release and moving `v0` line.",
      "`gallery` requires a later release.",
    ),
    "utf8",
  );
  await writeFile(
    join(repoRoot, "SECURITY.md"),
    "# Security\n\nSecurity fixes land on the default branch.\n",
    "utf8",
  );

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes(
      "README.md is missing current-state contract text: `gallery` is available in the current immutable `v0.5.0` release and moving `v0` line.",
    ),
    true,
  );
  assert.equal(
    result.issues.includes("SECURITY.md is missing current-state contract text: `v0.5.0`"),
    true,
  );
  assert.equal(
    result.issues.includes(
      "SECURITY.md is missing current-state contract text: moving `v0` release line",
    ),
    true,
  );
});

test("validateDocs rejects ADR documents missing from the ADR index", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: "# Fixture\n",
    adrIndex: [
      "# Architecture Decisions",
      "",
      "## Accepted ADRs",
      "",
      "- `0001-recorded-decision.md`: recorded decision",
      "",
    ].join("\n"),
    adrFiles: {
      "0001-recorded-decision.md": "# Recorded Decision\n",
      "0002-missing-decision.md": "# Missing Decision\n",
    },
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes(
      "docs/adr/README.md missing ADR index entry for docs/adr/0002-missing-decision.md",
    ),
    true,
  );
});

test("validateDocs rejects stale ADR index entries", async (t) => {
  const repoRoot = await createDocsFixture({
    readme: "# Fixture\n",
    adrIndex: [
      "# Architecture Decisions",
      "",
      "## Accepted ADRs",
      "",
      "- `0001-recorded-decision.md`: recorded decision",
      "- `0002-stale-decision.md`: stale decision",
      "",
    ].join("\n"),
    adrFiles: {
      "0001-recorded-decision.md": "# Recorded Decision\n",
    },
  });
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const result = await validateDocs({ repoRoot });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes(
      "docs/adr/README.md references missing ADR file docs/adr/0002-stale-decision.md",
    ),
    true,
  );
});

test("agent-assisted draft guide JSON examples match the assessment schema", async () => {
  const guideText = await readFile(
    join(process.cwd(), "docs", "cli", "agent-assisted-drafts.md"),
    "utf8",
  );
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

test("ledger format guide JSON example matches the assessment schema", async () => {
  const guideText = await readFile(join(process.cwd(), "docs", "cli", "ledger-format.md"), "utf8");
  const examples = extractJsonCodeBlocks(guideText).map((block) => JSON.parse(block));

  assert.equal(examples.length, 1);

  const ledgerRecord = examples[0];
  const result = validateContributionAssessment(ledgerRecord);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(ledgerRecord.source.pullRequestNumber, 42);
  assert.equal(ledgerRecord.evidenceRefs[0].url, "https://github.com/example/project/pull/42");
  assert.equal(Object.hasOwn(ledgerRecord, "score"), false);
  assert.equal(Object.hasOwn(ledgerRecord, "averageScore"), false);
  assert.equal(Object.hasOwn(ledgerRecord, "rank"), false);
});

async function createDocsFixture(options) {
  const repoRoot = await mkdtemp(join(tmpdir(), "clarissimi-docs-validation-"));
  await writeRequiredFiles(repoRoot);
  await mkdir(join(repoRoot, "docs"), { recursive: true });
  await writeFile(join(repoRoot, "README.md"), withReadmeContracts(options.readme), "utf8");

  if (options.guide !== undefined) {
    await writeFile(join(repoRoot, "docs", "guide.md"), options.guide, "utf8");
  }

  if (options.adrIndex !== undefined || options.adrFiles !== undefined) {
    await mkdir(join(repoRoot, "docs", "adr"), { recursive: true });
  }

  if (options.adrIndex !== undefined) {
    await writeFile(join(repoRoot, "docs", "adr", "README.md"), options.adrIndex, "utf8");
  }

  if (options.adrFiles !== undefined) {
    for (const [fileName, content] of Object.entries(options.adrFiles)) {
      await writeFile(join(repoRoot, "docs", "adr", fileName), content, "utf8");
    }
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
  if (path === "ARCHITECTURE.md") {
    return [
      "# Architecture",
      "",
      "docs/architecture/00-system-boundary.md",
      "docs/architecture/02-runtime-flow.md",
      "docs/architecture/03-quality-attributes.md",
      ".clarissimi/contributions.jsonl",
      "",
    ].join("\n");
  }

  if (path === "DEVELOPMENT.md") {
    return [
      "# Development",
      "",
      "docs/product/02-spec.md",
      "docs/monorepo/package-ownership.md",
      ".clarissimi/contributions.jsonl",
      "VALIDATION.md",
      "",
    ].join("\n");
  }

  if (path === "docs/architecture/03-quality-attributes.md") {
    return [
      "# Quality Attributes",
      "",
      "docs/product/02-spec.md",
      "docs/architecture/02-runtime-flow.md",
      ".clarissimi/contributions.jsonl",
      "packages/schemas",
      "",
    ].join("\n");
  }

  if (path === "SECURITY.md") {
    return "# Security\n\nSupported immutable release `v0.5.0` and moving `v0` release line.\n";
  }

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

function withReadmeContracts(readme) {
  return [
    readme.trimEnd(),
    "",
    "Current release: 0disoft/clarissimi@v0.5.0",
    "`gallery` is available in the current immutable `v0.5.0` release and moving `v0` line.",
    "clarissimi completion <bash|zsh|fish|powershell>",
    "",
  ].join("\n");
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
