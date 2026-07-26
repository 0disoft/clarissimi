import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  standaloneCliPackageContract,
  standaloneCliPackagePaths,
} from "./build-standalone-cli-package.mjs";
import {
  resolveNpmInvocation,
  validateInstalledPackageManifest,
} from "./verify-standalone-cli-package.mjs";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function verifyPublishedStandaloneCliPackage(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const version = options.version ?? standaloneCliPackageContract.version;
  const runCommand = options.runCommand ?? runChildCommand;
  if (version !== standaloneCliPackageContract.version) {
    throw new Error(
      `Published verification version ${version} must equal source contract ${standaloneCliPackageContract.version}.`,
    );
  }

  const npmInvocation = await resolveNpmInvocation(options);
  const tempRoot = await mkdtemp(join(tmpdir(), "clarissimi-published-cli-"));
  try {
    const consumerDir = join(tempRoot, "consumer");
    const fixturePath = join(consumerDir, "github-fixture.json");
    await mkdir(consumerDir, { recursive: true });
    await writeFile(
      join(consumerDir, "package.json"),
      `${JSON.stringify({ name: "clarissimi-published-consumer", private: true }, null, 2)}\n`,
      "utf8",
    );
    await copyFile(join(repoRoot, "fixtures", "github-merged-pr-basic.json"), fixturePath);

    await runCommand(
      npmInvocation.command,
      [...npmInvocation.prefixArgs, ...createPublishedInstallArgs(version, consumerDir)],
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
    const manifestIssues = validateInstalledPackageManifest(installedManifest);
    if (manifestIssues.length > 0) {
      throw new Error(
        `Published standalone CLI manifest is invalid:\n- ${manifestIssues.join("\n- ")}`,
      );
    }

    await access(
      join(
        consumerDir,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "clarissimi.cmd" : "clarissimi",
      ),
    );
    const installedCli = join(installedPackageDir, standaloneCliPackagePaths.bundledCli);
    const help = await runCommand(process.execPath, [installedCli, "--help"], { cwd: consumerDir });
    if (!help.stdout.includes("Clarissimi CLI") || !help.stdout.includes("clarissimi --help")) {
      throw new Error("Published standalone CLI did not emit the expected help contract.");
    }
    if (help.stderr !== "") {
      throw new Error("Published standalone CLI help wrote unexpected stderr output.");
    }

    const dryRun = await runCommand(
      process.execPath,
      [installedCli, "recognize", "--github-fixture", fixturePath, "--mode", "dry-run", "--json"],
      { cwd: consumerDir },
    );
    validatePublishedDryRunOutput(JSON.parse(dryRun.stdout));
    await runCommand(
      npmInvocation.command,
      [...npmInvocation.prefixArgs, "audit", "signatures", "--prefix", consumerDir],
      { cwd: consumerDir },
    );

    console.log(
      JSON.stringify(
        {
          result: "passed",
          package: `${standaloneCliPackageContract.name}@${version}`,
          install: "exact registry version",
          executableShim: "present",
          help: "passed",
          fixtureDryRun: "passed",
          signatureAudit: "passed",
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export function createPublishedInstallArgs(version, consumerDir) {
  return [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--save-exact",
    "--prefix",
    consumerDir,
    `${standaloneCliPackageContract.name}@${version}`,
  ];
}

export function validatePublishedDryRunOutput(output) {
  const expected = {
    ok: true,
    command: "recognize",
    fixtureKind: "github",
    approvalStatus: "draft",
    publicOutputsRendered: false,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (output?.[key] !== value) {
      throw new Error(
        `Published standalone CLI dry-run ${key} must equal ${JSON.stringify(value)}.`,
      );
    }
  }
  if (output.assessment?.contributor?.login !== "octocat") {
    throw new Error("Published standalone CLI dry-run must preserve the synthetic contributor.");
  }
}

function runChildCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
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
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        const detail = (stderr || stdout).trim();
        reject(
          new Error(
            `${command} failed with exit code ${exitCode}.${detail === "" ? "" : `\n${detail.slice(0, 4000)}`}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await verifyPublishedStandaloneCliPackage();
}
