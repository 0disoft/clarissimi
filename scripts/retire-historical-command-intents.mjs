import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const COMPLETED_VERSION_TOKENS = [
  "v0_2_0",
  "v0_3_0",
  "v0_3_1",
  "v0_3_2",
  "v0_3_3",
  "v0_3_4",
  "v0_3_5",
  "v0_4_0",
  "v0_5_0",
  "v0_5_1",
  "v0_5_2",
];

const COMPLETED_MILESTONES = [
  "cli_write_coordination",
  "contributor_features",
  "ci_format_fix",
  "major_alias_promotion",
  "release_auth_fix",
  "marketplace_release",
  "marketplace_completion",
  "marketplace_evidence_status",
  "marketplace_verifier",
  "readme_onboarding",
  "transient_pr_recovery",
  "provider_result_quality",
  "mustflow_update_contract",
  "mustflow_init_recovery",
  "action_provider_failure_summary",
  "provider_result_dirty_corpus",
  "provider_model_eval",
  "remaining_hardening",
  "comment_endpoint_hardening",
  "proposal_branch_race_reconciliation",
  "source_pr_comment",
  "release_version_guard",
  "runner_admission_diagnostics",
  "external_review_hardening",
  "automation_test_build_contract",
  "stable_v1_tooling",
  "standalone_cli_package",
  "package_policy_sync",
  "workspace_package_policy_diagnostics",
  "readme_cli_publication_status",
];

const COMPLETED_LIFECYCLE_PREFIXES = [
  "git_stage_",
  "git_commit_",
  "git_amend_",
  "git_push_main_",
  "hosted_ci_",
];

const REQUIRED_SHARED_INTENTS = [
  "test_release_publication",
  "test_major_alias_promotion",
  "test_marketplace_release",
];

const MANUAL_REASON =
  "Historic exact-tag revalidation dispatches credentialed external and full-write workflows.";

export function retireHistoricalCommandIntents(text) {
  const document = parseIntentDocument(text);
  const removed = [];
  const manualOnly = [];
  const keptBlocks = [];

  for (const block of document.blocks) {
    if (shouldRemoveIntent(block.name)) {
      removed.push(block.name);
      continue;
    }

    if (isHistoricPostTagIntent(block.name)) {
      manualOnly.push(block.name);
      keptBlocks.push(toManualOnlyBlock(block));
      continue;
    }

    keptBlocks.push(block);
  }

  const normalized = [document.preamble, ...keptBlocks.map((block) => block.text.trimEnd())]
    .filter((part) => part.length > 0)
    .join("\n\n");
  const output = `${normalized}\n`;
  const issues = validateHistoricalCommandIntentContract(output);
  if (issues.length > 0) {
    throw new Error(`Historical command intent retirement failed:\n${issues.join("\n")}`);
  }

  return { text: output, removed, manualOnly };
}

export function validateHistoricalCommandIntentContract(text) {
  const document = parseIntentDocument(text);
  const byName = new Map(document.blocks.map((block) => [block.name, block]));
  const issues = [];

  for (const block of document.blocks) {
    if (shouldRemoveIntent(block.name)) {
      issues.push(`Historical completed intent must be removed: ${block.name}.`);
    }

    if (isHistoricPostTagIntent(block.name)) {
      if (!block.text.includes('status = "manual_only"')) {
        issues.push(`${block.name} status must be manual_only.`);
      }
      if (!block.text.includes('run_policy = "manual_only"')) {
        issues.push(`${block.name} run_policy must be manual_only.`);
      }
      if (!block.text.includes(`reason = "${MANUAL_REASON}"`)) {
        issues.push(`${block.name} must explain its credentialed external effects.`);
      }
      if (!block.text.includes('agent_action = "do_not_run_report_manual_only"')) {
        issues.push(`${block.name} must fail closed for agents.`);
      }
      if (block.text.includes("required_after =")) {
        issues.push(`${block.name} must not depend on a removed historical publish intent.`);
      }
    }
  }

  for (const name of REQUIRED_SHARED_INTENTS) {
    if (!byName.has(name)) {
      issues.push(`Shared release regression intent must remain configured: ${name}.`);
    }
  }

  return issues;
}

function parseIntentDocument(text) {
  const normalized = text.replaceAll("\r\n", "\n");
  const matches = [...normalized.matchAll(/^\[intents\.([^\]]+)\]$/gm)];
  const firstIndex = matches[0]?.index ?? normalized.length;
  const blocks = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? normalized.length;
    return {
      name: match[1],
      text: normalized.slice(start, end).trimEnd(),
    };
  });
  return {
    preamble: normalized.slice(0, firstIndex).trimEnd(),
    blocks,
  };
}

function shouldRemoveIntent(name) {
  if (isHistoricPostTagIntent(name)) {
    return false;
  }
  if (COMPLETED_VERSION_TOKENS.some((token) => name.includes(token))) {
    return true;
  }
  if (name === "external_source_validation_transient_pr_recovery") {
    return true;
  }
  return COMPLETED_LIFECYCLE_PREFIXES.some((prefix) =>
    COMPLETED_MILESTONES.some((milestone) => name === `${prefix}${milestone}`),
  );
}

function isHistoricPostTagIntent(name) {
  return COMPLETED_VERSION_TOKENS.some((token) => name === `release_${token}_post_tag_evidence`);
}

function toManualOnlyBlock(block) {
  const lines = block.text
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("reason = ") &&
        !line.startsWith("agent_action = ") &&
        !line.startsWith("required_after = "),
    )
    .map((line) => {
      if (line.startsWith("status = ")) {
        return 'status = "manual_only"';
      }
      if (line.startsWith("run_policy = ")) {
        return 'run_policy = "manual_only"';
      }
      return line;
    });
  const runPolicyIndex = lines.findIndex((line) => line.startsWith("run_policy = "));
  lines.splice(
    runPolicyIndex + 1,
    0,
    `reason = "${MANUAL_REASON}"`,
    'agent_action = "do_not_run_report_manual_only"',
  );
  return { ...block, text: lines.join("\n") };
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const commandsPath = join(repoRoot, ".mustflow", "config", "commands.toml");
  const manifestPath = join(repoRoot, ".mustflow", "config", "manifest.lock.toml");
  const commands = await readFile(commandsPath, "utf8");
  const result = retireHistoricalCommandIntents(commands);
  const hash = createHash("sha256").update(result.text).digest("hex");
  const manifest = await readFile(manifestPath, "utf8");
  const updatedManifest = updateCommandsHash(manifest, hash);

  await replaceFile(commandsPath, result.text);
  await replaceFile(manifestPath, updatedManifest);
  process.stdout.write(
    `${JSON.stringify({ ok: true, removed: result.removed, manualOnly: result.manualOnly }, null, 2)}\n`,
  );
}

function updateCommandsHash(manifest, hash) {
  const sectionPattern =
    /(\[files\."\.mustflow\/config\/commands\.toml"\][\s\S]*?content_hash = ")sha256:[a-f0-9]+("(?:\r?\n|$))/;
  if (!sectionPattern.test(manifest)) {
    throw new Error("manifest lock does not contain the commands.toml content hash entry.");
  }
  return manifest.replace(sectionPattern, `$1sha256:${hash}$2`);
}

async function replaceFile(path, content) {
  const temporaryPath = `${path}.clarissimi-retire-${process.pid}`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
