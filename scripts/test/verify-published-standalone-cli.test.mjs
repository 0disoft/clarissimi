import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublishedInstallArgs,
  validatePublishedDryRunOutput,
} from "../verify-published-standalone-cli.mjs";

test("published CLI verification installs one exact version without lifecycle scripts", () => {
  assert.deepEqual(createPublishedInstallArgs("0.1.2", "C:\\consumer"), [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--save-exact",
    "--prefix",
    "C:\\consumer",
    "clarissimi@0.1.2",
  ]);
});

test("published CLI verification accepts the bounded synthetic dry-run", () => {
  assert.doesNotThrow(() =>
    validatePublishedDryRunOutput({
      ok: true,
      command: "recognize",
      fixtureKind: "github",
      approvalStatus: "draft",
      publicOutputsRendered: false,
      assessment: { contributor: { login: "octocat" } },
    }),
  );
});

test("published CLI verification rejects drifted output", () => {
  assert.throws(
    () =>
      validatePublishedDryRunOutput({
        ok: true,
        command: "recognize",
        fixtureKind: "github",
        approvalStatus: "approved",
        publicOutputsRendered: true,
        assessment: { contributor: { login: "octocat" } },
      }),
    /approvalStatus must equal "draft"/,
  );
});
