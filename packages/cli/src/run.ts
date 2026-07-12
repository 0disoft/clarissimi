import { join } from "node:path";

import {
  CONTRIBUTORS_JSON_PATH,
  CONTRIBUTORS_MARKDOWN_PATH,
  CONTRIBUTIONS_JSONL_PATH,
  DRAFTS_DIR_PATH,
  RendererValidationError,
  STATIC_DATA_JSON_PATH,
  appendPublicContributionRecord,
  assertUniqueContributionRecords,
  draftReviewFilename,
  parseContributionsJsonl,
  buildMaintainerRecentRecognitionShareDocument,
  renderContributorsJson,
  renderContributorsMarkdown,
  renderContributionsJsonl,
  renderDraftReviewJson,
  renderPrettyJson,
  renderRecognitionOutputs,
  renderStaticContributionsJson,
  toDraftReviewRecord,
} from "@clarissimi/renderers";
import {
  createFakeContributionDraftProvider,
  createOpenAiCompatibleContributionDraftProvider,
  type ContributionDraftProvider,
} from "@clarissimi/providers";
import {
  isConfigProvider,
  isConfigProviderThinking,
  isConfigMarkdownSummary,
  validateContributionAssessment,
  type ConfigMarkdownSummary,
  type ConfigProviderThinking,
  type ValidationIssue,
} from "@clarissimi/schemas";

import {
  CliUsageError,
  getBooleanFlag,
  getStringFlag,
  parseArgs,
  type ParsedArgs,
} from "./args.js";
import { validateConfigFile, type CliConfig } from "./config.js";
import { CLI_EXIT_CODES, type CliExitCode } from "./exit-codes.js";
import { recognizeFixture, recognizeGitHubFixture } from "./fixture.js";
import {
  fileExists,
  parseJsonText,
  readTextFile,
  resolveFromCwd,
  withFileLock,
  writeTextFilesAtomically,
  writeTextFile,
  type CliIo,
} from "./io.js";

const GLOBAL_FLAGS = new Set(["help"]);
const COMMAND_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  help: new Set(["help"]),
  "validate-config": new Set(["config", "json", "help"]),
  "validate-ledger": new Set(["ledger", "json", "help"]),
  recognize: new Set([
    "fixture",
    "github-fixture",
    "mode",
    "config",
    "markdown-summary",
    "provider",
    "provider-model",
    "provider-endpoint",
    "provider-thinking",
    "json",
    "help",
  ]),
  "stage-draft": new Set(["draft", "drafts-dir", "json", "help"]),
  "approve-draft": new Set(["draft", "json", "help"]),
  "import-draft": new Set([
    "draft",
    "ledger",
    "out-dir",
    "config",
    "markdown-summary",
    "json",
    "help",
  ]),
  rebuild: new Set(["ledger", "out-dir", "config", "markdown-summary", "json", "help"]),
  analytics: new Set(["ledger", "window-days", "as-of", "json", "help"]),
};

export async function runCli(argv: readonly string[], io: CliIo): Promise<CliExitCode> {
  let args: ParsedArgs | undefined;
  try {
    args = parseArgs(argv);
    rejectUnsupportedFlags(args);

    if (args.command === undefined || args.command === "help" || getBooleanFlag(args, "help")) {
      if (args.command === "help") {
        const positionalError = rejectUnexpectedPositionals(args, "help");
        if (positionalError !== undefined) {
          throw new CliUsageError(positionalError);
        }
      }
      io.stdout(renderHelp());
      return CLI_EXIT_CODES.success;
    }

    switch (args.command) {
      case "validate-config":
        return await runValidateConfig(args, io);
      case "validate-ledger":
        return await runValidateLedger(args, io);
      case "recognize":
        return await runRecognize(args, io);
      case "stage-draft":
        return await runStageDraft(args, io);
      case "approve-draft":
        return await runApproveDraft(args, io);
      case "import-draft":
        return await runImportDraft(args, io);
      case "rebuild":
        return await runRebuild(args, io);
      case "analytics":
        return await runAnalytics(args, io);
      default:
        throw new CliUsageError(`Unknown command: ${args.command}`);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      return writeUsageFailure(io, args, argv, error.message);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (isJsonRequested(args, argv)) {
      io.stdout(
        `${JSON.stringify({ ok: false, command: resolveCommandName(args, argv), message }, null, 2)}\n`,
      );
    } else {
      io.stderr(`${message}\n`);
    }
    return CLI_EXIT_CODES.providerFailure;
  }
}

function rejectUnsupportedFlags(args: ParsedArgs): void {
  const supported = args.command === undefined ? GLOBAL_FLAGS : COMMAND_FLAGS[args.command];
  if (supported === undefined) {
    return;
  }

  for (const name of args.flags.keys()) {
    if (!supported.has(name)) {
      const scope = args.command === undefined ? "global CLI" : args.command;
      throw new CliUsageError(`Unknown option for ${scope}: --${name}.`);
    }
  }
}

async function runValidateConfig(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "validate-config");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  try {
    const configPath = getStringFlag(args, "config");
    const result = await validateConfigFile(io.cwd, configPath);
    writeOutput(io, args, {
      ok: true,
      command: "validate-config",
      configPath: result.path ?? null,
      message:
        result.path === undefined
          ? "No config file found; defaults are valid."
          : "Config is valid.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "validate-config", error);
    return CLI_EXIT_CODES.invalidConfig;
  }
}

async function runValidateLedger(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "validate-ledger");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  try {
    const ledgerPath = resolveFromCwd(
      io.cwd,
      getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH,
    );
    const text = (await fileExists(ledgerPath)) ? await readTextFile(ledgerPath) : "";
    const records = parseContributionsJsonl(text);
    assertUniqueContributionRecords(records);

    writeOutput(io, args, {
      ok: true,
      command: "validate-ledger",
      ledgerPath,
      records: records.length,
      message: "Ledger is valid.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "validate-ledger", error);
    return CLI_EXIT_CODES.invalidLedger;
  }
}

async function runRecognize(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "recognize");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  const fixturePath = getStringFlag(args, "fixture");
  const githubFixturePath = getStringFlag(args, "github-fixture");
  if (fixturePath === undefined && githubFixturePath === undefined) {
    throw new CliUsageError("recognize requires --fixture <path> or --github-fixture <path>.");
  }

  if (fixturePath !== undefined && githubFixturePath !== undefined) {
    throw new CliUsageError(
      "recognize accepts only one fixture input: use --fixture or --github-fixture.",
    );
  }

  try {
    const config = (await validateConfigFile(io.cwd, getStringFlag(args, "config"))).config;
    const mode = getStringFlag(args, "mode") ?? config.mode ?? "dry-run";
    if (mode !== "dry-run") {
      throw new CliUsageError(
        "The fixture-first recognize command currently supports only --mode dry-run.",
      );
    }

    const selectedFixturePath = fixturePath ?? githubFixturePath;
    if (selectedFixturePath === undefined) {
      throw new CliUsageError("recognize requires a fixture path.");
    }

    const provider = await resolveRecognitionProvider(args, io, config);
    const result =
      fixturePath !== undefined
        ? await recognizeFixture(resolveFromCwd(io.cwd, selectedFixturePath), provider)
        : await recognizeGitHubFixture(resolveFromCwd(io.cwd, selectedFixturePath), provider);
    const canRenderPublicOutputs =
      result.assessment.maintainerApprovalStatus === "approved" ||
      result.assessment.maintainerApprovalStatus === "auto_approved";
    const outputs = canRenderPublicOutputs
      ? {
          contributionsJsonl: renderContributionsJsonl([result.assessment]),
          contributorsJson: renderContributorsJson([result.assessment]),
          contributorsMarkdown: renderContributorsMarkdown([result.assessment], {
            summary: resolveMarkdownSummary(args, config),
          }),
          staticDataJson: renderStaticContributionsJson([result.assessment]),
        }
      : null;

    writeOutput(io, args, {
      ok: true,
      command: "recognize",
      mode,
      provider: provider.id,
      fixtureKind: result.fixtureKind,
      fixturePath: selectedFixturePath,
      draftCreated: true,
      approvalStatus: result.assessment.maintainerApprovalStatus,
      publicOutputsRendered: outputs !== null,
      redactionChanged: result.redactionChanged,
      redactionMatchCount: result.redactionMatchCount,
      assessment: sanitizeAssessmentForCliOutput(result.assessment),
      outputPreview: outputs,
      message:
        outputs === null
          ? "Draft created; public outputs were not rendered because the assessment is not approved."
          : "Approved fixture rendered public output previews.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }

    writeFailure(io, args, "recognize", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.policyRejection
      : CLI_EXIT_CODES.providerFailure;
  }
}

async function runStageDraft(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "stage-draft");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  const draftPath = getStringFlag(args, "draft");
  if (draftPath === undefined) {
    throw new CliUsageError("stage-draft requires --draft <path>.");
  }

  const draftsDir = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "drafts-dir", DRAFTS_DIR_PATH) ?? DRAFTS_DIR_PATH,
  );

  try {
    const parsedDraftInput = parseJsonText(
      await readTextFile(resolveFromCwd(io.cwd, draftPath)),
      draftPath,
    );
    const draftInput = parseDraftImportInput(parsedDraftInput);
    const draftReview = toDraftReviewRecord(draftInput.assessment);

    const stagedDraftPath = join(draftsDir, draftInboxFilename(draftReview));
    if (await fileExists(stagedDraftPath)) {
      throw new RendererValidationError("Draft is already staged for this contribution source.", [
        {
          path: "$.source",
          code: "duplicate_staged_draft",
          message:
            "A staged draft already exists for this repository, event, and pull request number.",
        },
      ]);
    }

    await writeTextFile(stagedDraftPath, renderDraftReviewJson(draftReview));

    writeOutput(io, args, {
      ok: true,
      command: "stage-draft",
      draftFormat: draftInput.format,
      draftPath,
      stagedDraftPath,
      approvalStatus: draftReview.maintainerApprovalStatus,
      message: "Draft staged for maintainer review; approve it before importing into the ledger.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "stage-draft", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.policyRejection
      : CLI_EXIT_CODES.writeFailure;
  }
}

async function runApproveDraft(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "approve-draft");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  const draftPath = getStringFlag(args, "draft");
  if (draftPath === undefined) {
    throw new CliUsageError("approve-draft requires --draft <path>.");
  }

  const resolvedDraftPath = resolveFromCwd(io.cwd, draftPath);

  try {
    const parsedDraftInput = parseJsonText(await readTextFile(resolvedDraftPath), draftPath);
    const draftInput = parseDraftImportInput(parsedDraftInput);
    const draftReview = toDraftReviewRecord(draftInput.assessment);
    const approvedDraft = {
      ...draftReview,
      maintainerApprovalStatus: "approved",
    };

    await writeTextFile(resolvedDraftPath, renderPrettyJson(approvedDraft));

    writeOutput(io, args, {
      ok: true,
      command: "approve-draft",
      draftFormat: draftInput.format,
      draftPath,
      approvedDraftPath: resolvedDraftPath,
      approvalStatus: approvedDraft.maintainerApprovalStatus,
      message: "Draft approved; import it to publish the recognition record.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "approve-draft", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.policyRejection
      : CLI_EXIT_CODES.writeFailure;
  }
}

async function runImportDraft(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "import-draft");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  const draftPath = getStringFlag(args, "draft");
  if (draftPath === undefined) {
    throw new CliUsageError("import-draft requires --draft <path>.");
  }

  const ledgerPath = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH,
  );
  const outDir = getStringFlag(args, "out-dir");

  try {
    const config = (await validateConfigFile(io.cwd, getStringFlag(args, "config"))).config;
    const parsedDraftInput = parseJsonText(
      await readTextFile(resolveFromCwd(io.cwd, draftPath)),
      draftPath,
    );
    const draftInput = parseDraftImportInput(parsedDraftInput);
    const validation = validateContributionAssessment(draftInput.assessment);
    if (!validation.ok) {
      throw new RendererValidationError(
        "Draft is not a valid contribution assessment.",
        validation.issues,
      );
    }

    const outputDirectory = outDir === undefined ? undefined : resolveFromCwd(io.cwd, outDir);
    const recordCount = await withFileLock(`${ledgerPath}.lock`, async () => {
      const existingLedgerText = (await fileExists(ledgerPath))
        ? await readTextFile(ledgerPath)
        : "";
      const existingRecords = parseContributionsJsonl(existingLedgerText);
      const nextRecords = appendPublicContributionRecord(existingRecords, validation.value);
      const outputs = renderRecognitionOutputs(nextRecords, {
        summary: resolveMarkdownSummary(args, config),
      });
      const files = new Map<string, string>();
      if (outputDirectory !== undefined) {
        files.set(join(outputDirectory, CONTRIBUTIONS_JSONL_PATH), outputs.contributionsJsonl);
        files.set(join(outputDirectory, CONTRIBUTORS_JSON_PATH), outputs.contributorsJson);
        files.set(join(outputDirectory, CONTRIBUTORS_MARKDOWN_PATH), outputs.contributorsMarkdown);
        files.set(join(outputDirectory, STATIC_DATA_JSON_PATH), outputs.staticDataJson);
      }
      files.set(ledgerPath, outputs.contributionsJsonl);
      await writeTextFilesAtomically(
        Array.from(files, ([path, value]) => ({ path, value })),
        ledgerPath,
      );
      return nextRecords.length;
    });

    writeOutput(io, args, {
      ok: true,
      command: "import-draft",
      draftFormat: draftInput.format,
      draftPath,
      ledgerPath,
      records: recordCount,
      imported: 1,
      approvalStatus: validation.value.maintainerApprovalStatus,
      wroteDerivedFiles: outDir !== undefined,
      outputDirectory: outDir ?? null,
      files:
        outDir === undefined
          ? [CONTRIBUTIONS_JSONL_PATH]
          : [
              CONTRIBUTIONS_JSONL_PATH,
              CONTRIBUTORS_JSON_PATH,
              CONTRIBUTORS_MARKDOWN_PATH,
              STATIC_DATA_JSON_PATH,
            ],
      message:
        outDir === undefined
          ? "Approved draft imported into the ledger; pass --out-dir to write derived files."
          : "Approved draft imported and derived files rebuilt.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }

    writeFailure(io, args, "import-draft", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.policyRejection
      : CLI_EXIT_CODES.writeFailure;
  }
}

const draftInboxFilename = draftReviewFilename;

function parseDraftImportInput(value: unknown): {
  readonly format: "assessment" | "draft-envelope";
  readonly assessment: unknown;
} {
  if (!isRecord(value) || value.schemaVersion !== "clarissimi.draft-envelope/v1") {
    return {
      format: "assessment",
      assessment: value,
    };
  }

  const issues: ValidationIssue[] = [];
  if (value.assessment === undefined) {
    issues.push({
      path: "$.assessment",
      code: "missing_assessment",
      message: "Draft envelope must include an assessment object.",
    });
  }

  if (value.draftProvenance !== undefined && !isRecord(value.draftProvenance)) {
    issues.push({
      path: "$.draftProvenance",
      code: "expected_object",
      message: "Draft provenance must be an object when present.",
    });
  }

  if (issues.length > 0) {
    throw new RendererValidationError("Draft envelope is not valid.", issues);
  }

  return {
    format: "draft-envelope",
    assessment: value.assessment,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveMarkdownSummary(args: ParsedArgs, config: CliConfig): ConfigMarkdownSummary {
  const value = getStringFlag(args, "markdown-summary") ?? config.markdownSummary ?? "none";
  if (!isConfigMarkdownSummary(value)) {
    throw new CliUsageError(`Unsupported Markdown summary: ${value}`);
  }

  return value;
}

async function runRebuild(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const positionalError = rejectUnexpectedPositionals(args, "rebuild");
  if (positionalError !== undefined) {
    throw new CliUsageError(positionalError);
  }

  const ledgerPath = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH,
  );
  const outDir = getStringFlag(args, "out-dir");

  try {
    const config = (await validateConfigFile(io.cwd, getStringFlag(args, "config"))).config;
    const ledgerText = (await fileExists(ledgerPath)) ? await readTextFile(ledgerPath) : "";
    const records = parseContributionsJsonl(ledgerText);
    assertUniqueContributionRecords(records);
    const outputs = renderRecognitionOutputs(records, {
      summary: resolveMarkdownSummary(args, config),
    });

    if (outDir !== undefined) {
      await writeRenderedOutputs(resolveFromCwd(io.cwd, outDir), outputs);
    }

    writeOutput(io, args, {
      ok: true,
      command: "rebuild",
      ledgerPath,
      records: records.length,
      wroteFiles: outDir !== undefined,
      outputDirectory: outDir ?? null,
      files: [
        CONTRIBUTIONS_JSONL_PATH,
        CONTRIBUTORS_JSON_PATH,
        CONTRIBUTORS_MARKDOWN_PATH,
        STATIC_DATA_JSON_PATH,
      ],
      message:
        outDir === undefined
          ? "Rebuild preview completed; pass --out-dir to write derived files."
          : "Rebuild completed.",
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }

    writeFailure(io, args, "rebuild", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.invalidLedger
      : CLI_EXIT_CODES.writeFailure;
  }
}

async function runAnalytics(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const [subcommand, ...extraPositionals] = args.positionals;
  if (subcommand !== "recent-share" || extraPositionals.length > 0) {
    throw new CliUsageError("analytics requires the recent-share subcommand.");
  }

  const ledgerPath = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH,
  );

  try {
    const ledgerText = (await fileExists(ledgerPath)) ? await readTextFile(ledgerPath) : "";
    const records = parseContributionsJsonl(ledgerText);
    assertUniqueContributionRecords(records);
    const analyticsOptions: Parameters<typeof buildMaintainerRecentRecognitionShareDocument>[1] =
      {};
    assignOptional(analyticsOptions, "asOf", parseIsoDateTimeFlag(args, "as-of"));
    assignOptional(analyticsOptions, "windowDays", parsePositiveIntegerFlag(args, "window-days"));
    const analytics = buildMaintainerRecentRecognitionShareDocument(records, analyticsOptions);

    writeOutput(io, args, {
      ok: true,
      command: "analytics",
      subcommand: "recent-share",
      ledgerPath,
      analytics,
      message: renderRecentShareMessage(analytics),
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }

    writeFailure(io, args, "analytics", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.invalidLedger
      : CLI_EXIT_CODES.writeFailure;
  }
}

function writeOutput(io: CliIo, args: ParsedArgs, value: Record<string, unknown>): void {
  if (getBooleanFlag(args, "json")) {
    io.stdout(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  io.stdout(`${value.message ?? "Command completed."}\n`);
}

function writeUsageFailure(
  io: CliIo,
  args: ParsedArgs | undefined,
  argv: readonly string[],
  message: string,
): CliExitCode {
  const normalizedMessage = message.trimEnd();
  if (isJsonRequested(args, argv)) {
    io.stdout(
      `${JSON.stringify(
        { ok: false, command: resolveCommandName(args, argv), message: normalizedMessage },
        null,
        2,
      )}\n`,
    );
  } else {
    io.stderr(`${normalizedMessage}\n`);
  }

  return CLI_EXIT_CODES.usage;
}

function isJsonRequested(args: ParsedArgs | undefined, argv: readonly string[]): boolean {
  return args?.flags.get("json") === true || (args === undefined && argv.includes("--json"));
}

function resolveCommandName(args: ParsedArgs | undefined, argv: readonly string[]): string {
  if (args !== undefined) {
    return args.command ?? "clarissimi";
  }

  const first = argv[0];
  return first !== undefined && !first.startsWith("--") ? first : "clarissimi";
}

function writeFailure(io: CliIo, args: ParsedArgs, command: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  if (getBooleanFlag(args, "json")) {
    io.stdout(`${JSON.stringify({ ok: false, command, message }, null, 2)}\n`);
    return;
  }

  io.stderr(`${message}\n`);
}

function renderHelp(): string {
  return [
    "Clarissimi CLI",
    "",
    "Commands:",
    "  clarissimi help",
    "  clarissimi --help",
    "  clarissimi validate-config [--config <path>] [--json]",
    "  clarissimi validate-ledger [--ledger <path>] [--json]",
    "  clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run [--config <path>] [--markdown-summary none|table] [--provider <id>] [--provider-model <model>] [--provider-endpoint <url>] [--provider-thinking disabled] [--json]",
    "  clarissimi stage-draft --draft <path> [--drafts-dir <path>] [--json]",
    "  clarissimi approve-draft --draft <path> [--json]",
    "  clarissimi import-draft --draft <path> [--ledger <path>] [--out-dir <path>] [--config <path>] [--markdown-summary none|table] [--json]",
    "  clarissimi rebuild [--ledger <path>] [--out-dir <path>] [--config <path>] [--markdown-summary none|table] [--json]",
    "  clarissimi analytics recent-share [--ledger <path>] [--window-days <days>] [--as-of <iso-date>] [--json]",
    "",
  ].join("\n");
}

function rejectUnexpectedPositionals(args: ParsedArgs, command: string): string | undefined {
  if (args.positionals.length === 0) {
    return undefined;
  }

  return `${command} does not accept positional arguments: ${args.positionals.join(" ")}`;
}

function renderRecentShareMessage(
  value: ReturnType<typeof buildMaintainerRecentRecognitionShareDocument>,
): string {
  const lines = [
    "Recent recognition share calculated for maintainer review only.",
    `Window: ${value.window.startsAt} through ${value.window.asOf} (${value.window.windowDays} days)`,
    `Included records: ${value.window.includedRecords}`,
    `Total recognition weight: ${value.window.totalRecognitionWeight}`,
  ];

  value.contributors.forEach((entry) => {
    lines.push(
      `- ${entry.contributor.login}: ${formatPercentage(entry.recognitionShare)} ` +
        `of recent recognition weight across ${entry.recognitionCount} record(s)`,
    );
  });

  return lines.join("\n");
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function writeRenderedOutputs(
  outDir: string,
  outputs: {
    readonly contributionsJsonl: string;
    readonly contributorsJson: string;
    readonly contributorsMarkdown: string;
    readonly staticDataJson: string;
  },
): Promise<void> {
  await Promise.all(
    [
      [CONTRIBUTIONS_JSONL_PATH, outputs.contributionsJsonl],
      [CONTRIBUTORS_JSON_PATH, outputs.contributorsJson],
      [CONTRIBUTORS_MARKDOWN_PATH, outputs.contributorsMarkdown],
      [STATIC_DATA_JSON_PATH, outputs.staticDataJson],
    ].map(([path, value]) => writeTextFile(join(outDir, path), value)),
  );
}

async function resolveRecognitionProvider(
  args: ParsedArgs,
  io: CliIo,
  existingConfig?: CliConfig,
): Promise<ContributionDraftProvider> {
  const configPath = getStringFlag(args, "config");
  const config = existingConfig ?? (await validateConfigFile(io.cwd, configPath)).config;
  const providerId = getStringFlag(args, "provider") ?? config.provider ?? "fake";
  if (!isConfigProvider(providerId)) {
    throw new CliUsageError(`Unsupported provider: ${providerId}`);
  }

  if (providerId === "fake") {
    return createFakeContributionDraftProvider();
  }

  if (providerId === "openai-compatible") {
    const options: Parameters<typeof createOpenAiCompatibleContributionDraftProvider>[0] = {
      model: requiredProviderOption(
        getStringFlag(args, "provider-model") ?? config.providerModel,
        "provider model",
        "--provider-model or config providerModel",
      ),
      token: requiredProviderToken(io.env ?? process.env),
      fetch: io.fetch ?? fetch,
    };
    assignOptional(
      options,
      "endpoint",
      getStringFlag(args, "provider-endpoint") ?? config.providerEndpoint,
    );
    assignOptional(
      options,
      "thinking",
      parseProviderThinking(getStringFlag(args, "provider-thinking") ?? config.providerThinking),
    );
    return createOpenAiCompatibleContributionDraftProvider(options);
  }

  throw new CliUsageError(`Unsupported provider: ${providerId}`);
}

function requiredProviderOption(value: string | undefined, label: string, source: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new CliUsageError(`OpenAI-compatible provider requires ${label} from ${source}.`);
  }

  return value;
}

function requiredProviderToken(env: NodeJS.ProcessEnv): string {
  const token = env.CLARISSIMI_PROVIDER_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    throw new CliUsageError("OpenAI-compatible provider requires CLARISSIMI_PROVIDER_TOKEN.");
  }

  return token;
}

function parseProviderThinking(value: string | undefined): ConfigProviderThinking | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  if (!isConfigProviderThinking(value)) {
    throw new CliUsageError("OpenAI-compatible provider thinking supports only disabled.");
  }

  return value;
}

function parsePositiveIntegerFlag(args: ParsedArgs, name: string): number | undefined {
  const value = getStringFlag(args, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`--${name} must be a positive integer.`);
  }

  return parsed;
}

function parseIsoDateTimeFlag(args: ParsedArgs, name: string): string | undefined {
  const value = getStringFlag(args, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new CliUsageError(`--${name} must be an ISO-compatible date time.`);
  }

  return new Date(parsed).toISOString();
}

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function sanitizeAssessmentForCliOutput<T extends { evidenceRefs: readonly object[] }>(
  assessment: T,
): T {
  return {
    ...assessment,
    evidenceRefs: assessment.evidenceRefs.map((ref) => {
      const { excerpt: _excerpt, ...safeRef } = ref as Record<string, unknown>;
      return safeRef;
    }),
  };
}
