import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CONFIG_PROVIDERS } from "@clarissimi/schemas";

import { renderShellCompletion } from "../dist/completion.js";

const shells = process.platform === "win32" ? ["pwsh", "powershell"] : ["pwsh"];
const cases = [
  { input: "clarissimi rec", expected: ["recognize"] },
  { input: "clarissimi --h", expected: ["--help"] },
  { input: "clarissimi recognize --provider ", expected: [...CONFIG_PROVIDERS] },
  { input: "clarissimi recognize --provider o", expected: ["openai-compatible"] },
  {
    input: "clarissimi recognize --provider=",
    expected: CONFIG_PROVIDERS.map((provider) => `--provider=${provider}`),
  },
  { input: "clarissimi recognize --provider=o", expected: ["--provider=openai-compatible"] },
  { input: "clarissimi recognize --PROVIDER=o", expected: ["--provider=openai-compatible"] },
  { input: "clarissimi rebuild --markdown-summary=g", expected: ["--markdown-summary=gallery"] },
  {
    input: "clarissimi recognize --provider-endpoint-trust ",
    expected: ["public", "private-network"],
  },
  { input: "clarissimi analytics ", expected: ["recent-share"] },
  { input: "clarissimi analytics --json re", expected: ["recent-share"] },
  {
    input: "clarissimi analytics --as-of 2026-10-09 --json re",
    expected: ["recent-share"],
  },
  {
    input: "clarissimi analytics --as-of=2026-10-09 --json re",
    expected: ["recent-share"],
  },
  { input: "clarissimi analytics --as-of recent-", expected: [] },
  { input: "clarissimi analytics recent-share --json re", expected: [] },
  { input: "clarissimi completion po", expected: ["powershell"] },
  { input: "clarissimi rebuild --ch", expected: ["--check"] },
  {
    input: "clarissimi recognize --provider  --json",
    cursor: "clarissimi recognize --provider ".length,
    expected: [...CONFIG_PROVIDERS],
  },
  {
    input: "clarissimi recognize --provider=o --json",
    cursor: "clarissimi recognize --provider=o".length,
    expected: ["--provider=openai-compatible"],
  },
];

for (const shell of shells) {
  test(`${shell} completes commands and enum values at the cursor`, async (t) => {
    const probe = spawnSync(
      shell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "exit 0"],
      { timeout: 10_000 },
    );
    if (probe.error?.code === "ENOENT") {
      t.skip(`${shell} is not installed`);
      return;
    }
    assert.equal(probe.status, 0, probe.error?.message ?? probe.stderr?.toString());

    const dir = await mkdtemp(join(tmpdir(), "clarissimi-powershell-completion-"));
    try {
      const scriptPath = join(dir, "completion.ps1");
      const inputs = cases.map(({ input, cursor }) => ({ input, cursor: cursor ?? input.length }));
      await writeFile(
        scriptPath,
        [
          "$ErrorActionPreference = 'Stop'",
          renderShellCompletion("powershell"),
          `$cases = '${JSON.stringify(inputs).replaceAll("'", "''")}' | ConvertFrom-Json`,
          "$actual = @($cases | ForEach-Object {",
          "  $completion = TabExpansion2 $_.input $_.cursor",
          "  ,@($completion.CompletionMatches | ForEach-Object { $_.CompletionText })",
          "})",
          "ConvertTo-Json -InputObject $actual -Compress -Depth 4",
        ].join("\n"),
        "utf8",
      );
      const result = spawnSync(
        shell,
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
        ],
        { cwd: dir, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(result.status, 0, result.error?.message ?? result.stderr);
      const actual = JSON.parse(result.stdout.trim());
      for (const [index, entry] of cases.entries()) {
        assert.deepEqual(actual[index], entry.expected, entry.input);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
