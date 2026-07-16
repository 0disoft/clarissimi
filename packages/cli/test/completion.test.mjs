import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CLI_COMMAND_SPECS,
  SUPPORTED_COMPLETION_SHELLS,
  getSupportedCliFlagNames,
  renderCliHelp,
} from "../dist/command-spec.js";
import { runCli } from "../dist/index.js";

const SHELL_MARKERS = {
  bash: ["_clarissimi_completion", "complete -F"],
  zsh: ["#compdef clarissimi", "_arguments -C"],
  fish: ["complete -c clarissimi -f", "__fish_seen_subcommand_from"],
  powershell: ["Register-ArgumentCompleter", "System.Management.Automation.CompletionResult"],
};

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-completion-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function run(argv, cwd) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    cwd,
    env: {
      CLARISSIMI_PROVIDER_TOKEN: "must-not-appear",
      GITHUB_TOKEN: "must-not-appear",
    },
    fetch: async () => {
      throw new Error("completion must not call the network");
    },
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
}

test("command metadata is unique and owns help and supported-option rendering", () => {
  const commandNames = CLI_COMMAND_SPECS.map((command) => command.name);
  assert.equal(new Set(commandNames).size, commandNames.length);

  const help = renderCliHelp();
  for (const command of CLI_COMMAND_SPECS) {
    assert.match(command.name, /^[a-z][a-z0-9-]*$/);
    assert.match(command.usage, new RegExp(`^clarissimi ${command.name}(?: |$)`));
    assert.ok(help.includes(`  ${command.usage}`));

    const flagNames = command.flags.map((flag) => flag.name);
    assert.equal(new Set(flagNames).size, flagNames.length, `${command.name} flags must be unique`);
    assert.deepEqual(
      [...(getSupportedCliFlagNames(command.name) ?? [])].sort(),
      [...flagNames].sort(),
    );

    for (const flag of command.flags) {
      assert.match(flag.name, /^[a-z][a-z0-9-]*$/);
      if (flag.values !== undefined) {
        assert.ok(flag.valueLabel !== undefined);
        assert.equal(new Set(flag.values).size, flag.values.length);
      }
    }
  }
});

test("completion renders deterministic static scripts without repository, environment, or network reads", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, ".clarissimi"));
    await writeFile(join(dir, ".clarissimi", "config.json"), "not valid json\n");

    for (const shell of SUPPORTED_COMPLETION_SHELLS) {
      const first = await run(["completion", shell], dir);
      const second = await run(["completion", shell], dir);

      assert.equal(first.exitCode, 0, shell);
      assert.equal(first.stderr, "", shell);
      assert.equal(first.stdout, second.stdout, shell);
      assert.ok(first.stdout.endsWith("\n"), shell);
      assert.ok(!first.stdout.includes("\r"), shell);
      assert.ok(first.stdout.includes("validate-config"), shell);
      assert.ok(
        first.stdout.includes(
          shell === "fish" ? "-l provider-endpoint-trust" : "--provider-endpoint-trust",
        ),
        shell,
      );
      assert.ok(first.stdout.includes("openai-compatible"), shell);
      assert.ok(first.stdout.includes("private-network"), shell);
      for (const marker of SHELL_MARKERS[shell]) {
        assert.ok(first.stdout.includes(marker), `${shell} must include ${marker}`);
      }
      for (const forbidden of [
        ".clarissimi",
        "must-not-appear",
        "GITHUB_TOKEN",
        "CLARISSIMI_PROVIDER_TOKEN",
        "Get-ChildItem",
        "compgen -f",
        "__fish_complete_path",
        "_files",
      ]) {
        assert.ok(!first.stdout.includes(forbidden), `${shell} leaked or enumerated ${forbidden}`);
      }
    }
  });
});

test("completion fails closed for missing, unknown, and extra arguments", async () => {
  await withTempDir(async (dir) => {
    const cases = [
      { argv: ["completion"], message: /completion requires one shell/ },
      { argv: ["completion", "cmd"], message: /Unsupported completion shell: cmd/ },
      {
        argv: ["completion", "bash", "extra"],
        message: /completion accepts exactly one shell/,
      },
    ];

    for (const entry of cases) {
      const result = await run(entry.argv, dir);
      assert.equal(result.exitCode, 1, entry.argv.join(" "));
      assert.equal(result.stdout, "", entry.argv.join(" "));
      assert.match(result.stderr, entry.message);
    }
  });
});

test("completion rejects JSON while preserving the global JSON usage-error contract", async () => {
  await withTempDir(async (dir) => {
    const result = await run(["completion", "bash", "--json"], dir);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, "");
    assert.equal(output.ok, false);
    assert.equal(output.command, "completion");
    assert.match(output.message, /Unknown option for completion: --json/);
  });
});

test("global and command help advertise completion without generating a script", async () => {
  await withTempDir(async (dir) => {
    const globalHelp = await run(["--help"], dir);
    const commandHelp = await run(["completion", "--help"], dir);

    assert.equal(globalHelp.exitCode, 0);
    assert.equal(commandHelp.exitCode, 0);
    assert.equal(globalHelp.stdout, commandHelp.stdout);
    assert.ok(globalHelp.stdout.includes("clarissimi completion <bash|zsh|fish|powershell>"));
    assert.ok(!globalHelp.stdout.includes("Register-ArgumentCompleter"));
  });
});
