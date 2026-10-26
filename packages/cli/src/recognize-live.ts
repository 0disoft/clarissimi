import { join } from "node:path";

import { collectLiveMergedPullRequestEvidence, createGitHubApiClient } from "@clarissimi/github";
import { DRAFTS_DIR_PATH, draftReviewFilename, renderDraftReviewJson } from "@clarissimi/renderers";

import { CliUsageError, getBooleanFlag, getStringFlag, type ParsedArgs } from "./args.js";
import { validateConfigFile } from "./config.js";
import { CLI_EXIT_CODES, type CliExitCode } from "./exit-codes.js";
import { recognizeCollectedEvidence } from "./fixture.js";
import { resolveFromCwd, writeTextFileExclusive, type CliIo } from "./io.js";
import {
  classifyRecognitionFailure,
  sanitizeAssessmentForCliOutput,
  writeFailure,
  writeOutput,
} from "./output.js";
import { resolveRecognitionProvider } from "./provider.js";

const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export async function runRecognizeLive(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const selected = selectPullRequests(args);
  const stagedDraftPaths: string[] = [];
  let writing = false;
  try {
    const config = (await validateConfigFile(io.cwd, getStringFlag(args, "config"))).config;
    const mode = getStringFlag(args, "mode") ?? config.mode ?? "dry-run";
    if (mode !== "dry-run" && mode !== "stage-draft")
      throw new CliUsageError("Live recognition supports dry-run or stage-draft.");
    if (mode === "dry-run" && args.flags.has("drafts-dir"))
      throw new CliUsageError("--drafts-dir requires --mode stage-draft.");
    const draftsDir = resolveFromCwd(io.cwd, getStringFlag(args, "drafts-dir") ?? DRAFTS_DIR_PATH);
    const provider = await resolveRecognitionProvider(args, io, config);
    const env = io.env ?? process.env;
    const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
    const client = createGitHubApiClient({
      ...(token === undefined ? {} : { token }),
      ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    });
    const results = [];
    for (const pullRequestNumber of selected.numbers) {
      const collected = await collectLiveMergedPullRequestEvidence({
        client,
        repository: selected.repository,
        pullRequestNumber,
        allowPartialFiles: getBooleanFlag(args, "allow-partial"),
      });
      const result = await recognizeCollectedEvidence(collected, "live-github", provider);
      results.push({
        pullRequestNumber,
        assessment: sanitizeAssessmentForCliOutput(result.assessment),
        redactionChanged: result.redactionChanged,
        redactionMatchCount: result.redactionMatchCount,
        collectionCoverage: collected.collectionCoverage,
      });
    }
    if (mode === "stage-draft") {
      writing = true;
      for (const result of results) {
        const path = join(draftsDir, draftReviewFilename(result.assessment));
        await writeTextFileExclusive(path, renderDraftReviewJson(result.assessment));
        stagedDraftPaths.push(path);
      }
    }
    writeOutput(
      io,
      args,
      {
        ok: true,
        command: "recognize",
        mode,
        provider: provider.id,
        fixtureKind: "live-github",
        repository: selected.repository,
        results,
        stagedDraftPaths,
        publicOutputsRendered: false,
        message:
          mode === "dry-run"
            ? "Live drafts created; no files written."
            : "Live drafts staged; review before approval.",
      },
      [
        `Pull requests: ${selected.numbers.join(", ")}`,
        ...results.map(
          (result) =>
            `PR #${result.pullRequestNumber} coverage: ${JSON.stringify(result.collectionCoverage)}`,
        ),
        ...stagedDraftPaths.map((path) => `Staged draft: ${path}`),
      ],
    );
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    if (stagedDraftPaths.length > 0) {
      writeOutput(
        io,
        args,
        {
          ok: false,
          command: "recognize",
          stagedDraftPaths,
          message:
            "Batch staging stopped; listed drafts were saved and existing files were preserved.",
        },
        stagedDraftPaths,
      );
    } else writeFailure(io, args, "recognize", error);
    return writing ? CLI_EXIT_CODES.writeFailure : classifyRecognitionFailure(error);
  }
}

function selectPullRequests(args: ParsedArgs): { repository: string; numbers: number[] } {
  if (args.flags.has("fixture") || args.flags.has("github-fixture"))
    throw new CliUsageError("Live and fixture inputs cannot be combined.");
  const pr = getStringFlag(args, "pr");
  let repository = getStringFlag(args, "repo");
  let numbersText = getStringFlag(args, "prs");
  if (pr !== undefined) {
    if (repository !== undefined || numbersText !== undefined)
      throw new CliUsageError("Use --pr or --repo with --prs, not both.");
    let url: URL;
    try {
      url = new URL(pr);
    } catch {
      throw new CliUsageError("--pr requires a merged github.com pull request URL.");
    }
    const match = /^\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)\/?$/.exec(url.pathname);
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      match === null
    ) {
      throw new CliUsageError(
        "--pr requires a plain https://github.com/owner/name/pull/number URL.",
      );
    }
    repository = match[1];
    numbersText = match[2];
  }
  if (repository === undefined || !REPOSITORY_PATTERN.test(repository) || numbersText === undefined)
    throw new CliUsageError(
      "Live recognition requires --pr <url> or --repo <owner/name> --prs <numbers>.",
    );
  const parts = numbersText.split(",").map((value) => value.trim());
  const numbers = parts.map(Number);
  if (
    numbers.length > 25 ||
    parts.some((value) => !/^[1-9]\d*$/.test(value)) ||
    numbers.some((value) => !Number.isSafeInteger(value)) ||
    new Set(numbers).size !== numbers.length
  ) {
    throw new CliUsageError("--prs requires 1 to 25 unique positive safe-integer PR numbers.");
  }
  return { repository, numbers };
}
