import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CONFIG_PROVIDERS,
  CONFIG_PROVIDER_ENDPOINT_TRUST_VALUES,
  CONFIG_PROVIDER_THINKING_VALUES,
  CONFIG_MODES,
  CONFIG_MARKDOWN_SUMMARIES,
  validateClarissimiConfig,
} from "../../packages/schemas/dist/index.js";
import { runCli } from "../../packages/cli/dist/index.js";
import { loadActionConfigFromEnvironment } from "../../packages/action/dist/config.js";

const fields = [
  ["provider", CONFIG_PROVIDERS],
  ["providerEndpointTrust", CONFIG_PROVIDER_ENDPOINT_TRUST_VALUES],
  ["providerThinking", CONFIG_PROVIDER_THINKING_VALUES],
  ["mode", CONFIG_MODES],
  ["markdownSummary", CONFIG_MARKDOWN_SUMMARIES],
];
const invalidValue = "UNSUPPORTED_CONFIG_CANARY";

for (const [field, choices] of fields) {
  test(`${field} errors show allowed choices across schema, CLI, and Action`, async () => {
    const config = { [field]: invalidValue };
    const result = validateClarissimiConfig(config);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].code, "invalid_enum");
    assert.equal(result.issues[0].path, `$.${field}`);
    assert.ok(result.issues[0].message.includes(choices.join(", ")));
    assert.ok(!result.issues[0].message.includes(invalidValue));

    const dir = await mkdtemp(join(tmpdir(), "clarissimi-config-choices-"));
    try {
      const path = join(dir, "config.json");
      await writeFile(path, JSON.stringify(config));
      let stdout = "";
      let stderr = "";
      const exitCode = await runCli(["validate-config", "--config", path, "--json"], {
        cwd: dir,
        stdout: (value) => {
          stdout += value;
        },
        stderr: (value) => {
          stderr += value;
        },
      });
      assert.equal(exitCode, 2);
      assert.equal(stderr, "");
      const output = JSON.parse(stdout);
      assert.equal(output.ok, false);
      assert.ok(output.message.includes(field));
      assert.ok(output.message.includes(choices.join(", ")));
      assert.ok(!stdout.includes(invalidValue));

      await assert.rejects(
        () => loadActionConfigFromEnvironment({ INPUT_CONFIG_PATH: path, GITHUB_WORKSPACE: dir }),
        (error) =>
          error.message.includes(field) &&
          error.message.includes(choices.join(", ")) &&
          !error.message.includes(invalidValue),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
