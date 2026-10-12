import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildStandaloneCliPackage,
  standaloneCliPackageContract,
  standaloneCliPackagePaths,
  validateStandaloneCliPackageManifest,
} from "./build-standalone-cli-package.mjs";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const allowedPackageFiles = new Set(["LICENSE", "README.md", "dist/clarissimi.js", "package.json"]);

export async function verifyStandaloneCliPackage(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const runCommand = options.runCommand ?? runChildCommand;
  const { manifest, outputDir } = await buildStandaloneCliPackage({ repoRoot });
  const npmInvocation = await resolveNpmInvocation(options);
  const issues = validateStandaloneCliPackageManifest(manifest);
  issues.push(...(await validateStagedFiles(outputDir)));
  if (issues.length > 0) {
    throw new Error(`Standalone CLI package staging is invalid:\n- ${issues.join("\n- ")}`);
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "clarissimi-cli-package-"));
  try {
    const packResult = await runCommand(
      npmInvocation.command,
      [...npmInvocation.prefixArgs, "pack", "--json", "--pack-destination", tempRoot],
      { cwd: outputDir },
    );
    const packEntries = JSON.parse(packResult.stdout);
    const packEntry = Array.isArray(packEntries) ? packEntries[0] : undefined;
    if (packEntry === undefined || typeof packEntry.filename !== "string") {
      throw new Error("npm pack did not report a generated tarball filename.");
    }
    validatePackResult(packEntry);

    const consumerDir = join(tempRoot, "consumer");
    await mkdir(consumerDir, { recursive: true });
    await writeFile(
      join(consumerDir, "package.json"),
      `${JSON.stringify({ name: "clarissimi-package-consumer", private: true }, null, 2)}\n`,
      "utf8",
    );
    await runCommand(
      npmInvocation.command,
      [
        ...npmInvocation.prefixArgs,
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--prefix",
        consumerDir,
        join(tempRoot, packEntry.filename),
      ],
      { cwd: tempRoot },
    );

    const installedPackageDir = join(
      consumerDir,
      "node_modules",
      standaloneCliPackageContract.name,
    );
    const installedManifest = JSON.parse(
      await readFile(join(installedPackageDir, "package.json"), "utf8"),
    );
    const installedManifestIssues = validateInstalledPackageManifest(installedManifest);
    if (installedManifestIssues.length > 0) {
      throw new Error(
        `Installed standalone CLI manifest is invalid:\n- ${installedManifestIssues.join("\n- ")}`,
      );
    }

    const installedBinLink = join(
      consumerDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "clarissimi.cmd" : "clarissimi",
    );
    await access(installedBinLink);

    const installedCli = join(installedPackageDir, standaloneCliPackagePaths.bundledCli);
    const help = await runCommand(process.execPath, [installedCli, "--help"], { cwd: tempRoot });
    if (!help.stdout.includes("Clarissimi CLI") || !help.stdout.includes("clarissimi --help")) {
      throw new Error("Installed standalone CLI did not emit the expected help contract.");
    }
    if (help.stderr !== "") {
      throw new Error("Installed standalone CLI help wrote unexpected stderr output.");
    }
    await verifyInstalledCliWorkflow({ installedCli, repoRoot, tempRoot, runCommand });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }

  console.log("Standalone CLI package verification passed");
}

async function verifyInstalledCliWorkflow({ installedCli, repoRoot, tempRoot, runCommand }) {
  const cwd = join(tempRoot, "workflow");
  await mkdir(cwd);
  const fixture = JSON.parse(
    await readFile(join(repoRoot, "fixtures", "approved-draft.json"), "utf8"),
  );
  const draft = { ...fixture, maintainerApprovalStatus: "draft" };
  delete draft.approvalSnapshot;
  const input = join(cwd, "assessment.json");
  const draftsDir = join(cwd, "drafts");
  const ledger = join(cwd, "canonical.jsonl");
  const outDir = join(cwd, "outputs");
  await writeFile(input, `${JSON.stringify(draft)}\n`, "utf8");
  const invoke = async (command, args, expectedExitCode = 0) => {
    const result = await runCommand(process.execPath, [installedCli, command, ...args, "--json"], {
      cwd,
      expectedExitCode,
    });
    const value = JSON.parse(result.stdout);
    if (
      result.stderr !== "" ||
      value.ok !== (expectedExitCode === 0) ||
      value.command !== command
    ) {
      throw new Error(`Installed CLI ${command} did not return its expected result contract.`);
    }
    return value;
  };
  const staged = await invoke("stage-draft", ["--draft", input, "--drafts-dir", draftsDir]);
  if (
    staged.approvalStatus !== "draft" ||
    typeof staged.stagedDraftPath !== "string" ||
    dirname(staged.stagedDraftPath) !== draftsDir
  ) {
    throw new Error("Installed CLI did not stage an unapproved draft inside its selected inbox.");
  }
  const importArgs = ["--draft", staged.stagedDraftPath, "--ledger", ledger, "--out-dir", outDir];
  // The CLI contract reserves exit 6 for policy rejection.
  const rejected = await invoke("import-draft", importArgs, 6);
  if (
    !rejected.issueCodes?.includes("not_approved") ||
    JSON.stringify((await readdir(cwd)).sort()) !== JSON.stringify(["assessment.json", "drafts"])
  ) {
    throw new Error("Installed CLI must reject an unapproved draft without creating its outputs.");
  }
  const approved = await invoke("approve-draft", ["--draft", staged.stagedDraftPath]);
  const saved = JSON.parse(await readFile(staged.stagedDraftPath, "utf8"));
  if (
    approved.approvalStatus !== "approved" ||
    !/^[a-f0-9]{64}$/.test(saved.approvalSnapshot?.contentSha256 ?? "")
  ) {
    throw new Error("Installed CLI did not persist the approval content digest.");
  }
  const imported = await invoke("import-draft", importArgs);
  if (imported.records !== 1 || imported.wroteDerivedFiles !== true) {
    throw new Error("Installed CLI did not import one approved record and its derived outputs.");
  }
  const originalLedger = await readFile(ledger, "utf8");
  const rows = originalLedger
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (
    rows.length !== 1 ||
    rows[0].source.repository !== fixture.source.repository ||
    rows[0].publicRecognitionText !== fixture.publicRecognitionText
  ) {
    throw new Error("Installed CLI ledger does not preserve the reviewed contribution.");
  }
  const markdown = join(outDir, "CONTRIBUTORS.md");
  const originalMarkdown = await readFile(markdown, "utf8");
  await writeFile(markdown, "damaged derived output\n", "utf8");
  const rebuilt = await invoke("rebuild", ["--ledger", ledger, "--out-dir", outDir]);
  if (
    rebuilt.records !== 1 ||
    rebuilt.wroteFiles !== true ||
    (await readFile(ledger, "utf8")) !== originalLedger ||
    (await readFile(markdown, "utf8")) !== originalMarkdown
  ) {
    throw new Error(
      "Installed CLI rebuild did not repair output while preserving its canonical ledger.",
    );
  }
  await invoke("rebuild", ["--ledger", ledger, "--out-dir", outDir, "--check"]);
  const names = await readdir(cwd, { recursive: true });
  if (names.some((name) => /(?:\.clarissimi-(?:tmp|backup)|\.lock)$/.test(name))) {
    throw new Error("Installed CLI left generation files after a successful workflow.");
  }
}

export function validateInstalledPackageManifest(manifest) {
  const issues = [];
  if (manifest.name !== standaloneCliPackageContract.name) {
    issues.push(`name must equal ${standaloneCliPackageContract.name}.`);
  }
  if (manifest.version !== standaloneCliPackageContract.version) {
    issues.push(`version must equal ${standaloneCliPackageContract.version}.`);
  }
  if (JSON.stringify(manifest.bin) !== JSON.stringify(standaloneCliPackageContract.bin)) {
    issues.push(`bin must equal ${JSON.stringify(standaloneCliPackageContract.bin)}.`);
  }
  return issues;
}

export async function resolveNpmInvocation(options = {}) {
  const platform = options.platform ?? process.platform;
  const nodePath = options.nodePath ?? process.execPath;
  const canAccess = options.access ?? access;
  if (platform !== "win32") {
    return { command: "npm", prefixArgs: [] };
  }

  const npmCliPath = win32.join(
    win32.dirname(nodePath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  try {
    await canAccess(npmCliPath);
  } catch (error) {
    throw new Error(
      `Unable to locate the npm CLI beside Node.js at ${npmCliPath}: ${error.message}`,
    );
  }
  return { command: nodePath, prefixArgs: [npmCliPath] };
}

export function validatePackResult(packEntry) {
  if (packEntry.name !== standaloneCliPackageContract.name) {
    throw new Error(`npm pack name must be ${standaloneCliPackageContract.name}.`);
  }
  if (packEntry.version !== standaloneCliPackageContract.version) {
    throw new Error(`npm pack version must be ${standaloneCliPackageContract.version}.`);
  }
  if (!Array.isArray(packEntry.files)) {
    throw new Error("npm pack result must include a files array.");
  }
  const packedFiles = new Set(packEntry.files.map((file) => file.path));
  if (!setsEqual(packedFiles, allowedPackageFiles)) {
    throw new Error(
      `npm pack files must equal ${JSON.stringify([...allowedPackageFiles].sort())}; received ${JSON.stringify([...packedFiles].sort())}.`,
    );
  }
}

async function validateStagedFiles(outputDir) {
  const files = await listFiles(outputDir);
  const relativeFiles = new Set(
    files.map((path) => relative(outputDir, path).replaceAll(sep, "/")),
  );
  if (!setsEqual(relativeFiles, allowedPackageFiles)) {
    return [
      `staged files must equal ${JSON.stringify([...allowedPackageFiles].sort())}; received ${JSON.stringify([...relativeFiles].sort())}.`,
    ];
  }

  const bundledText = await readFile(join(outputDir, standaloneCliPackagePaths.bundledCli), "utf8");
  if (!bundledText.startsWith("#!/usr/bin/env node\n// Clarissimi standalone CLI npm package.")) {
    return ["bundled CLI must preserve the Node shebang and generated-package notice."];
  }
  return [];
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function runChildCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== (options.expectedExitCode ?? 0)) {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code}.\n${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await verifyStandaloneCliPackage();
}
