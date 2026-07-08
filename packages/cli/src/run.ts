import { join } from "node:path";

import {
  CONTRIBUTORS_JSON_PATH,
  CONTRIBUTORS_MARKDOWN_PATH,
  CONTRIBUTIONS_JSONL_PATH,
  RendererValidationError,
  STATIC_DATA_JSON_PATH,
  parseContributionsJsonl,
  renderContributorsJson,
  renderContributorsMarkdown,
  renderContributionsJsonl,
  renderStaticContributionsJson
} from "@clarissimi/renderers";

import { CliUsageError, getBooleanFlag, getStringFlag, parseArgs, type ParsedArgs } from "./args.js";
import { validateConfigFile } from "./config.js";
import { CLI_EXIT_CODES, type CliExitCode } from "./exit-codes.js";
import { recognizeFixture, recognizeGitHubFixture } from "./fixture.js";
import {
  fileExists,
  readTextFile,
  resolveFromCwd,
  writeTextFile,
  type CliIo
} from "./io.js";

export async function runCli(argv: readonly string[], io: CliIo): Promise<CliExitCode> {
  try {
    const args = parseArgs(argv);

    if (args.command === undefined || args.command === "help" || getBooleanFlag(args, "help")) {
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
      case "rebuild":
        return await runRebuild(args, io);
      default:
        io.stderr(`Unknown command: ${args.command}\n`);
        return CLI_EXIT_CODES.usage;
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(`${error.message}\n`);
      return CLI_EXIT_CODES.usage;
    }

    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return CLI_EXIT_CODES.providerFailure;
  }
}

async function runValidateConfig(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  try {
    const configPath = getStringFlag(args, "config");
    const result = await validateConfigFile(io.cwd, configPath);
    writeOutput(io, args, {
      ok: true,
      command: "validate-config",
      configPath: result.path ?? null,
      message: result.path === undefined ? "No config file found; defaults are valid." : "Config is valid."
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "validate-config", error);
    return CLI_EXIT_CODES.invalidConfig;
  }
}

async function runValidateLedger(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  try {
    const ledgerPath = resolveFromCwd(
      io.cwd,
      getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH
    );
    const text = (await fileExists(ledgerPath)) ? await readTextFile(ledgerPath) : "";
    const records = parseContributionsJsonl(text);

    writeOutput(io, args, {
      ok: true,
      command: "validate-ledger",
      ledgerPath,
      records: records.length,
      message: "Ledger is valid."
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "validate-ledger", error);
    return CLI_EXIT_CODES.invalidLedger;
  }
}

async function runRecognize(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const mode = getStringFlag(args, "mode", "dry-run");
  if (mode !== "dry-run") {
    io.stderr("The fixture-first recognize command currently supports only --mode dry-run.\n");
    return CLI_EXIT_CODES.usage;
  }

  const fixturePath = getStringFlag(args, "fixture");
  const githubFixturePath = getStringFlag(args, "github-fixture");
  if (fixturePath === undefined && githubFixturePath === undefined) {
    io.stderr("recognize requires --fixture <path> or --github-fixture <path>.\n");
    return CLI_EXIT_CODES.usage;
  }

  if (fixturePath !== undefined && githubFixturePath !== undefined) {
    io.stderr("recognize accepts only one fixture input: use --fixture or --github-fixture.\n");
    return CLI_EXIT_CODES.usage;
  }

  try {
    const selectedFixturePath = fixturePath ?? githubFixturePath;
    if (selectedFixturePath === undefined) {
      io.stderr("recognize requires a fixture path.\n");
      return CLI_EXIT_CODES.usage;
    }

    const result = fixturePath !== undefined
      ? await recognizeFixture(resolveFromCwd(io.cwd, selectedFixturePath))
      : await recognizeGitHubFixture(resolveFromCwd(io.cwd, selectedFixturePath));
    const canRenderPublicOutputs =
      result.assessment.maintainerApprovalStatus === "approved" ||
      result.assessment.maintainerApprovalStatus === "auto_approved";
    const outputs = canRenderPublicOutputs
      ? {
          contributionsJsonl: renderContributionsJsonl([result.assessment]),
          contributorsJson: renderContributorsJson([result.assessment]),
          contributorsMarkdown: renderContributorsMarkdown([result.assessment]),
          staticDataJson: renderStaticContributionsJson([result.assessment])
        }
      : null;

    writeOutput(io, args, {
      ok: true,
      command: "recognize",
      mode,
      fixtureKind: result.fixtureKind,
      fixturePath: selectedFixturePath,
      draftCreated: true,
      approvalStatus: result.assessment.maintainerApprovalStatus,
      publicOutputsRendered: outputs !== null,
      redactionChanged: result.redactionChanged,
      redactionMatchCount: result.redactionMatchCount,
      assessment: sanitizeAssessmentForCliOutput(result.assessment),
      outputPreview: outputs,
      message: outputs === null
        ? "Draft created; public outputs were not rendered because the assessment is not approved."
        : "Approved fixture rendered public output previews."
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "recognize", error);
    return error instanceof RendererValidationError
      ? CLI_EXIT_CODES.policyRejection
      : CLI_EXIT_CODES.providerFailure;
  }
}

async function runRebuild(args: ParsedArgs, io: CliIo): Promise<CliExitCode> {
  const ledgerPath = resolveFromCwd(
    io.cwd,
    getStringFlag(args, "ledger", CONTRIBUTIONS_JSONL_PATH) ?? CONTRIBUTIONS_JSONL_PATH
  );
  const outDir = getStringFlag(args, "out-dir");

  try {
    const ledgerText = (await fileExists(ledgerPath)) ? await readTextFile(ledgerPath) : "";
    const records = parseContributionsJsonl(ledgerText);
    const outputs = {
      [CONTRIBUTIONS_JSONL_PATH]: renderContributionsJsonl(records),
      [CONTRIBUTORS_JSON_PATH]: renderContributorsJson(records),
      [CONTRIBUTORS_MARKDOWN_PATH]: renderContributorsMarkdown(records),
      [STATIC_DATA_JSON_PATH]: renderStaticContributionsJson(records)
    };

    if (outDir !== undefined) {
      const resolvedOutDir = resolveFromCwd(io.cwd, outDir);
      await Promise.all(
        Object.entries(outputs).map(([path, value]) =>
          writeTextFile(join(resolvedOutDir, path), value)
        )
      );
    }

    writeOutput(io, args, {
      ok: true,
      command: "rebuild",
      ledgerPath,
      records: records.length,
      wroteFiles: outDir !== undefined,
      outputDirectory: outDir ?? null,
      files: Object.keys(outputs),
      message: outDir === undefined
        ? "Rebuild preview completed; pass --out-dir to write derived files."
        : "Rebuild completed."
    });
    return CLI_EXIT_CODES.success;
  } catch (error) {
    writeFailure(io, args, "rebuild", error);
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
    "  clarissimi validate-config [--config <path>] [--json]",
    "  clarissimi validate-ledger [--ledger <path>] [--json]",
    "  clarissimi recognize (--fixture <path> | --github-fixture <path>) --mode dry-run [--json]",
    "  clarissimi rebuild [--ledger <path>] [--out-dir <path>] [--json]",
    ""
  ].join("\n");
}

function sanitizeAssessmentForCliOutput<T extends { evidenceRefs: readonly object[] }>(
  assessment: T
): T {
  return {
    ...assessment,
    evidenceRefs: assessment.evidenceRefs.map((ref) => {
      const { excerpt: _excerpt, ...safeRef } = ref as Record<string, unknown>;
      return safeRef;
    })
  };
}
