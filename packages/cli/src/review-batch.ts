import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { checkExternalDraftApproval, createDraftApprovalSnapshot } from "@clarissimi/core";
import {
  CONTRIBUTIONS_JSONL_PATH,
  DRAFTS_DIR_PATH,
  RendererValidationError,
  assertUniqueContributionRecords,
  renderPrettyJson,
  renderRecognitionOutputs,
  toDraftReviewRecord,
  toPublicContributionRecord,
} from "@clarissimi/renderers";
import { validateContributionAssessment, type ContributionAssessment } from "@clarissimi/schemas";

import { CliUsageError, getBooleanFlag, getStringFlag, type ParsedArgs } from "./args.js";
import { CliConfigError, validateConfigFile } from "./config.js";
import { CLI_EXIT_CODES, type CliExitCode } from "./exit-codes.js";
import {
  canonicalFilePath,
  parseJsonText,
  readTextFile,
  resolveFromCwd,
  writeTextFileExclusive,
  writeTextFilesAtomically,
  type CliIo,
} from "./io.js";
import { CliLedgerValidationError, readLedgerRecords, withLedgerOutputLocks } from "./ledger.js";
import { resolveIncludeAutomationContributors, resolveMarkdownSummary } from "./output-options.js";
import { planRenderedOutputs } from "./output-plan.js";
import { writeFailure, writeOutput } from "./output.js";
import { assertConfigIsSeparateFromOutputs, pathKey, pathsReferToSameFile } from "./paths.js";

const MANIFEST_SCHEMA = "clarissimi.review-batch/v1";
const MAX_DRAFTS = 25;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const HASH_DATE = "2026-10-26T00:00:00.000Z";

interface ReviewEntry {
  readonly filename: string;
  readonly contentSha256: string;
  readonly assessment: ContributionAssessment;
}

interface ReviewManifest {
  readonly schemaVersion: typeof MANIFEST_SCHEMA;
  readonly draftsDir: string;
  readonly entries: readonly ReviewEntry[];
}

export async function runReviewDrafts(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  if (args.positionals.length > 0)
    throw new CliUsageError("review-drafts does not accept positional arguments.");
  const reviewFlag = getStringFlag(args, "review");
  if (reviewFlag === undefined) throw new CliUsageError("review-drafts requires --review <path>.");
  const reviewPath = resolveFromCwd(io.cwd, reviewFlag);
  const approve = getBooleanFlag(args, "approve");
  if (approve && args.flags.has("drafts-dir"))
    throw new CliUsageError("Approval uses the inbox recorded in --review; omit --drafts-dir.");
  if (
    !approve &&
    ["ledger", "out-dir", "markdown-summary", "exclude-automation-contributors"].some((name) =>
      args.flags.has(name),
    )
  )
    throw new CliUsageError("Publication options require --approve.");
  try {
    if (!approve) {
      const draftsDir = await canonicalFilePath(
        resolveFromCwd(io.cwd, getStringFlag(args, "drafts-dir") ?? DRAFTS_DIR_PATH),
      );
      if (pathKey(dirname(await canonicalFilePath(reviewPath))) === pathKey(draftsDir))
        throw new CliUsageError("Save the review manifest outside the draft inbox.");
      const files = (await readdir(draftsDir, { withFileTypes: true })).filter((file) =>
        file.name.endsWith(".json"),
      );
      if (files.length > 1_000)
        throw new CliUsageError("Draft inbox exceeds 1,000 files; select a smaller inbox.");
      const entries: ReviewEntry[] = [];
      for (const file of files.sort((left, right) => left.name.localeCompare(right.name))) {
        const current = await readInboxAssessment(draftsDir, file.name);
        if (
          current.maintainerApprovalStatus === "approved" &&
          checkExternalDraftApproval(current) === "valid"
        )
          continue;
        const assessment = toDraftReviewRecord(current);
        entries.push({ filename: file.name, contentSha256: contentHash(assessment), assessment });
        if (entries.length > MAX_DRAFTS) assertBatchSize(entries.length);
      }
      assertBatchSize(entries.length);
      const manifest: ReviewManifest = { schemaVersion: MANIFEST_SCHEMA, draftsDir, entries };
      const content = renderPrettyJson(manifest);
      if (Buffer.byteLength(content) > MAX_MANIFEST_BYTES)
        throw new CliUsageError("Review manifest exceeds 16 MiB.");
      const config = await validateConfigFile(io.cwd, getStringFlag(args, "config"));
      await assertConfigIsSeparateFromOutputs(io.cwd, config.path, [reviewPath]);
      await writeTextFileExclusive(reviewPath, content);
      writeOutput(
        io,
        args,
        {
          ok: true,
          command: "review-drafts",
          reviewPath,
          manifest,
          message:
            "Review the manifest; use --review with --approve to approve and import this exact batch.",
        },
        entries.map(
          (entry) =>
            `${entry.filename}: ${entry.assessment.publicRecognitionText} [${entry.contentSha256}]`,
        ),
      );
    } else {
      const manifest = parseManifest(await readBoundedJson(reviewPath, MAX_MANIFEST_BYTES));
      const result = await approveReviewBatch(manifest, reviewPath, args, io);
      writeOutput(io, args, {
        ok: true,
        command: "review-drafts",
        reviewPath,
        ...result,
        message: "Reviewed batch approved and imported; derived outputs rebuilt once.",
      });
    }
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    writeFailure(io, args, "review-drafts", error);
    if (error instanceof CliConfigError) return CLI_EXIT_CODES.invalidConfig;
    if (error instanceof CliLedgerValidationError) return CLI_EXIT_CODES.invalidLedger;
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.policyRejection
      : CLI_EXIT_CODES.writeFailure;
  }
}

async function approveReviewBatch(
  manifest: ReviewManifest,
  reviewPath: string,
  args: ParsedArgs,
  io: CliIo,
) {
  const configResult = await validateConfigFile(io.cwd, getStringFlag(args, "config"));
  const draftsDir = await canonicalFilePath(resolveFromCwd(io.cwd, manifest.draftsDir));
  const requestedLedgerPath = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "ledger") ?? CONTRIBUTIONS_JSONL_PATH,
  );
  const ledgerPath = await canonicalFilePath(requestedLedgerPath);
  const outDir = resolveFromCwd(io.cwd, getStringFlag(args, "out-dir") ?? ".");
  return withLedgerOutputLocks(ledgerPath, join(outDir, CONTRIBUTIONS_JSONL_PATH), async () => {
    if (pathKey(await canonicalFilePath(requestedLedgerPath)) !== pathKey(ledgerPath))
      throw new Error("Selected ledger path changed while acquiring its lock.");
    const approved: { path: string; assessment: ContributionAssessment }[] = [];
    for (const entry of manifest.entries) {
      const current = await readInboxDraft(draftsDir, entry.filename);
      if (
        contentHash(current) !== entry.contentSha256 ||
        contentHash(toDraftReviewRecord(entry.assessment)) !== entry.contentSha256
      ) {
        throw new RendererValidationError(
          "A reviewed draft or manifest changed; generate and review a new manifest.",
          [
            {
              path: "$.approvalSnapshot.contentSha256",
              code: "approval_snapshot_mismatch",
              message: "Review changed content again before approval.",
            },
          ],
        );
      }
      approved.push({
        path: join(draftsDir, entry.filename),
        assessment: {
          ...current,
          maintainerApprovalStatus: "approved",
          approvalSnapshot: createDraftApprovalSnapshot(current, new Date().toISOString()),
        },
      });
    }
    const existing = await readLedgerRecords(ledgerPath, { allowMissing: true });
    const records = [
      ...existing,
      ...approved.map((entry) => toPublicContributionRecord(entry.assessment)),
    ];
    assertUniqueContributionRecords(records);
    const outputs = renderRecognitionOutputs(records, {
      summary: resolveMarkdownSummary(args, configResult.config),
      includeAutomationContributors: resolveIncludeAutomationContributors(
        args,
        configResult.config,
      ),
    });
    const plan = await planRenderedOutputs(outDir, ledgerPath, outputs);
    const files = new Map(plan.entries.map((entry) => [entry.path, entry.value]));
    files.set(ledgerPath, outputs.contributionsJsonl);
    for (const output of files.keys()) {
      if (await pathsReferToSameFile(reviewPath, output))
        throw new CliUsageError("An output overlaps the review manifest.");
      for (const entry of approved) {
        if (await pathsReferToSameFile(entry.path, output))
          throw new CliUsageError("An output overlaps a reviewed draft.");
      }
    }
    for (const entry of approved) files.set(entry.path, renderPrettyJson(entry.assessment));
    const entries = [...files].map(([path, value]) => ({ path, value }));
    await assertConfigIsSeparateFromOutputs(
      io.cwd,
      configResult.path,
      entries.map((entry) => entry.path),
    );
    // Recheck the current content after planning; never replace a newly edited draft.
    for (const entry of manifest.entries) {
      if (contentHash(await readInboxDraft(draftsDir, entry.filename)) !== entry.contentSha256)
        throw new CliUsageError(
          "Draft changed during batch planning; regenerate the review manifest.",
        );
    }
    await writeTextFilesAtomically(entries, ledgerPath);
    return {
      imported: approved.length,
      records: records.length,
      ledgerPath,
      outputDirectory: outDir,
    };
  });
}

async function readInboxDraft(
  draftsDir: string,
  filename: string,
): Promise<ContributionAssessment> {
  return toDraftReviewRecord(await readInboxAssessment(draftsDir, filename));
}

async function readInboxAssessment(
  draftsDir: string,
  filename: string,
): Promise<ContributionAssessment> {
  if (basename(filename) !== filename || !filename.endsWith(".json"))
    throw new CliUsageError("Review filenames must be JSON basenames within the inbox.");
  const path = await canonicalFilePath(join(draftsDir, filename));
  if (pathKey(dirname(path)) !== pathKey(draftsDir))
    throw new CliUsageError("A reviewed draft resolves outside the inbox.");
  const info = await stat(path);
  if (info.nlink > 1) throw new CliUsageError("Reviewed drafts must not have multiple hard links.");
  const validation = validateContributionAssessment(await readBoundedJson(path, 512 * 1024));
  if (!validation.ok)
    throw new RendererValidationError("Invalid inbox assessment.", validation.issues);
  return validation.value;
}

async function readBoundedJson(path: string, limit: number): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit)
    throw new CliUsageError("Selected review input must be a bounded JSON file.");
  const text = await readTextFile(path);
  if (Buffer.byteLength(text) > limit)
    throw new CliUsageError("Review input grew beyond its byte limit.");
  return parseJsonText(text, path);
}

function contentHash(assessment: ContributionAssessment): string {
  return createDraftApprovalSnapshot(assessment, HASH_DATE).contentSha256;
}

function assertBatchSize(count: number): void {
  if (count < 1 || count > MAX_DRAFTS)
    throw new CliUsageError(
      "Review batches require 1 to 25 selected drafts; use a separate inbox for a smaller batch.",
    );
}

function parseManifest(value: unknown): ReviewManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== MANIFEST_SCHEMA ||
    typeof value.draftsDir !== "string" ||
    !value.draftsDir.trim() ||
    !Array.isArray(value.entries)
  )
    throw new CliUsageError("Invalid review-batch manifest.");
  assertBatchSize(value.entries.length);
  const entries = value.entries.map((entry: unknown) => {
    if (
      !isRecord(entry) ||
      typeof entry.filename !== "string" ||
      typeof entry.contentSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.contentSha256)
    )
      throw new CliUsageError("Invalid review-batch entry.");
    return {
      filename: entry.filename,
      contentSha256: entry.contentSha256,
      assessment: toDraftReviewRecord(entry.assessment),
    };
  });
  if (
    new Set(entries.map((entry) => pathKey(join(value.draftsDir as string, entry.filename))))
      .size !== entries.length
  )
    throw new CliUsageError("Review filenames must be unique.");
  return { schemaVersion: MANIFEST_SCHEMA, draftsDir: value.draftsDir, entries };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
