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
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }

  console.log("Standalone CLI package verification passed");
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
      if (code !== 0) {
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
