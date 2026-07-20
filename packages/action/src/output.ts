import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { OpenAiCompatibleProviderError } from "@clarissimi/providers";

import type { ActionRunSummary } from "./types.js";

export async function writeGitHubOutputs(
  outputPath: string | undefined,
  summary: ActionRunSummary,
  summaryJsonPath: string | undefined,
): Promise<void> {
  if (outputPath === undefined || outputPath.trim().length === 0) {
    return;
  }

  const lines = [
    `draft-count=${summary.draftCount}`,
    `proposed-entry-count=${summary.proposedEntryCount}`,
    `skipped-entry-count=${summary.skippedEntryCount}`,
    `mode=${summary.mode}`,
    `input-source=${summary.inputSource}`,
    `approval-status=${summary.approvalStatus ?? ""}`,
    `redaction-match-count=${summary.redactionMatchCount}`,
  ];
  if (summaryJsonPath !== undefined) {
    lines.push(`summary-json-path=${summaryJsonPath}`);
  }

  if (
    summary.mode === "propose" ||
    summary.mode === "stage-draft" ||
    summary.mode === "promote-draft"
  ) {
    lines.push(
      `staged-file-count=${summary.stagedFileCount}`,
      `proposal-branch=${summary.proposalBranch}`,
      `proposal-commit-sha=${summary.proposalCommitSha}`,
      `proposal-pull-request-number=${summary.proposalPullRequestNumber}`,
      `proposal-pull-request-url=${summary.proposalPullRequestUrl}`,
      `proposal-pull-request-action=${summary.proposalPullRequestAction}`,
      `source-comment-action=${summary.sourceCommentAction ?? ""}`,
      `source-comment-url=${summary.sourceCommentUrl ?? ""}`,
    );
  }

  if (summary.mode === "commit") {
    lines.push(
      `staged-file-count=${summary.stagedFileCount}`,
      `direct-commit-branch=${summary.directCommitBranch}`,
      `direct-commit-base-sha=${summary.directCommitBaseSha}`,
      `direct-commit-sha=${summary.directCommitSha}`,
      `direct-commit-created=${summary.directCommitCreated}`,
      `direct-commit-pushed=${summary.directCommitPushed}`,
    );
  }

  if (summary.mode === "gate") {
    lines.push(
      `gate-mode=${summary.gateMode}`,
      `gate-passed=${summary.gatePassed}`,
      `gate-decision=${summary.gateDecision ?? ""}`,
      `gate-reason=${summary.gateReason}`,
    );
  }

  await appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

export async function writeActionSummaryJson(
  summaryJsonPath: string | undefined,
  summary: ActionRunSummary,
): Promise<void> {
  if (summaryJsonPath === undefined) {
    return;
  }

  await mkdir(dirname(summaryJsonPath), { recursive: true });
  await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

export async function writeGitHubStepSummary(
  summaryPath: string | undefined,
  summary: ActionRunSummary,
): Promise<void> {
  if (summaryPath === undefined || summaryPath.trim().length === 0) {
    return;
  }

  const rows = [
    ["Mode", summary.mode],
    ["Input source", summary.inputSource],
    ["Drafts", String(summary.draftCount)],
    ["Proposed entries", String(summary.proposedEntryCount)],
    ["Skipped entries", String(summary.skippedEntryCount)],
    ["Approval status", summary.approvalStatus ?? "none"],
    ["Redaction matches", String(summary.redactionMatchCount)],
  ];

  if (
    summary.mode === "propose" ||
    summary.mode === "stage-draft" ||
    summary.mode === "promote-draft"
  ) {
    rows.push(
      ["Staged files", String(summary.stagedFileCount)],
      ["Proposal branch", summary.proposalBranch],
      ["Proposal pull request", summary.proposalPullRequestUrl],
      ["Proposal PR action", summary.proposalPullRequestAction],
    );
    if (summary.sourceCommentAction !== undefined && summary.sourceCommentUrl !== undefined) {
      rows.push(
        ["Source comment action", summary.sourceCommentAction],
        ["Source comment", summary.sourceCommentUrl],
      );
    }
  }

  if (summary.mode === "commit") {
    rows.push(
      ["Staged files", String(summary.stagedFileCount)],
      ["Target branch", summary.directCommitBranch],
      ["Commit SHA", summary.directCommitSha],
      ["Commit created", String(summary.directCommitCreated)],
      ["Commit pushed", String(summary.directCommitPushed)],
    );
  }

  if (summary.mode === "gate") {
    rows.push(
      ["Gate mode", summary.gateMode],
      ["Gate passed", String(summary.gatePassed)],
      ["Gate decision", summary.gateDecision ?? "none"],
      ["Gate reason", summary.gateReason],
    );
  }

  if (summary.mode === "dry-run" && summary.skippedReason !== undefined) {
    rows.push(["Skipped reason", summary.skippedReason]);
  }

  const markdown = [
    `## Clarissimi ${summary.mode} summary`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(
      ([field, value]) =>
        `| ${escapeMarkdownTableCell(field)} | ${escapeMarkdownTableCell(value)} |`,
    ),
    "",
  ].join("\n");

  await appendFile(summaryPath, markdown, "utf8");
}

const MAX_PROVIDER_FAILURE_ISSUES = 8;
const MAX_PROVIDER_FAILURE_FIELD_LENGTH = 120;

export async function writeGitHubProviderFailureStepSummary(
  summaryPath: string | undefined,
  error: OpenAiCompatibleProviderError,
): Promise<void> {
  if (
    summaryPath === undefined ||
    summaryPath.trim().length === 0 ||
    error.code !== "invalid_assessment" ||
    error.issues === undefined ||
    error.issues.length === 0
  ) {
    return;
  }

  const issues = error.issues.slice(0, MAX_PROVIDER_FAILURE_ISSUES);
  const markdown = [
    "## Clarissimi provider result rejected",
    "",
    "The provider output failed Clarissimi's result-quality contract. Raw provider content is intentionally omitted.",
    "",
    "| Rule | Path |",
    "| --- | --- |",
    ...issues.map(
      (issue) =>
        `| ${escapeMarkdownTableCell(boundedProviderFailureField(issue.code))} | ${escapeMarkdownTableCell(boundedProviderFailureField(issue.path))} |`,
    ),
    ...(error.issues.length > issues.length
      ? [`| additional_issues_omitted | ${error.issues.length - issues.length} |`]
      : []),
    "",
  ].join("\n");

  await appendFile(summaryPath, markdown, "utf8");
}

function boundedProviderFailureField(value: string): string {
  const normalized = value.replaceAll("\r", " ").replaceAll("\n", " ").trim();
  if (normalized.length <= MAX_PROVIDER_FAILURE_FIELD_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_PROVIDER_FAILURE_FIELD_LENGTH - 1)}…`;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
