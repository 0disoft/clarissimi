import assert from "node:assert/strict";
import test from "node:test";

import {
  retireHistoricalCommandIntents,
  validateHistoricalCommandIntentContract,
} from "../retire-historical-command-intents.mjs";

const sharedIntents = [
  "test_release_publication",
  "test_major_alias_promotion",
  "test_marketplace_release",
]
  .map(
    (name) =>
      `[intents.${name}]\nstatus = "configured"\nlifecycle = "oneshot"\nrun_policy = "agent_allowed"`,
  )
  .join("\n\n");

test("retirement removes completed mutations and keeps exact-tag revalidation manual-only", () => {
  const input = [
    'schema_version = "1"',
    sharedIntents,
    '[intents.release_v0_4_0_stable_publish]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.promote_v0_to_v0_4_0]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_provider_model_eval]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.hosted_ci_provider_model_eval]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_remaining_hardening]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.release_v0_4_0_post_tag_evidence]\nstatus = "configured"\nlifecycle = "oneshot"\nrun_policy = "agent_allowed"\ndescription = "Revalidate."\nrequired_after = ["release_v0_4_0_stable_publish"]',
  ].join("\n\n");

  const result = retireHistoricalCommandIntents(input);

  assert.deepEqual(result.removed, [
    "release_v0_4_0_stable_publish",
    "promote_v0_to_v0_4_0",
    "git_stage_provider_model_eval",
    "hosted_ci_provider_model_eval",
    "git_stage_remaining_hardening",
  ]);
  assert.deepEqual(result.manualOnly, ["release_v0_4_0_post_tag_evidence"]);
  assert.ok(!result.text.includes("release_v0_4_0_stable_publish"));
  assert.ok(result.text.includes('status = "manual_only"'));
  assert.ok(result.text.includes('run_policy = "manual_only"'));
  assert.ok(result.text.includes('agent_action = "do_not_run_report_manual_only"'));
  assert.ok(!result.text.includes("required_after ="));
  assert.deepEqual(validateHistoricalCommandIntentContract(result.text), []);
});

test("historical command validation rejects runnable or missing release boundaries", () => {
  const input = [
    'schema_version = "1"',
    '[intents.test_release_publication]\nstatus = "configured"',
    '[intents.release_v0_3_4_post_tag_evidence]\nstatus = "configured"\nrun_policy = "agent_allowed"\nrequired_after = ["release_v0_3_4_stable_publish"]',
    '[intents.promote_v0_to_v0_3_4]\nstatus = "configured"\nrun_policy = "agent_allowed"',
  ].join("\n\n");

  assert.deepEqual(validateHistoricalCommandIntentContract(input), [
    "release_v0_3_4_post_tag_evidence status must be manual_only.",
    "release_v0_3_4_post_tag_evidence run_policy must be manual_only.",
    "release_v0_3_4_post_tag_evidence must explain its credentialed external effects.",
    "release_v0_3_4_post_tag_evidence must fail closed for agents.",
    "release_v0_3_4_post_tag_evidence must not depend on a removed historical publish intent.",
    "Historical completed intent must be removed: promote_v0_to_v0_3_4.",
    "Shared release regression intent must remain configured: test_major_alias_promotion.",
    "Shared release regression intent must remain configured: test_marketplace_release.",
  ]);
});
