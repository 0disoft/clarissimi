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
    '[intents.release_v0_5_2_stable_publish]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.verify_marketplace_v0_5_2]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.release_v0_5_1_stable_publish]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.release_v0_5_0_stable_publish]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.promote_v0_to_v0_5_0]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_source_pr_comment]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.hosted_ci_release_version_guard]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_runner_admission_diagnostics]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_external_review_hardening]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_automation_test_build_contract]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_stable_v1_tooling]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_stable_v1_tooling]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_standalone_cli_package]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_standalone_cli_package]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_package_policy_sync]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_package_policy_sync]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_workspace_package_policy_diagnostics]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_workspace_package_policy_diagnostics]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_readme_cli_publication_status]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_readme_cli_publication_status]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_implementation_tracker_state_sync]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_implementation_tracker_state_sync]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_provider_model_eval]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.hosted_ci_provider_model_eval]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_remaining_hardening]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_stage_comment_endpoint_hardening]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.git_commit_proposal_branch_race_reconciliation]\nstatus = "configured"\nrun_policy = "agent_allowed"',
    '[intents.release_v0_5_2_post_tag_evidence]\nstatus = "configured"\nlifecycle = "oneshot"\nrun_policy = "agent_allowed"\ndescription = "Revalidate."\nrequired_after = ["release_v0_5_2_stable_publish"]',
    '[intents.release_v0_5_1_post_tag_evidence]\nstatus = "configured"\nlifecycle = "oneshot"\nrun_policy = "agent_allowed"\ndescription = "Revalidate."\nrequired_after = ["release_v0_5_1_stable_publish"]',
    '[intents.release_v0_5_0_post_tag_evidence]\nstatus = "configured"\nlifecycle = "oneshot"\nrun_policy = "agent_allowed"\ndescription = "Revalidate."\nrequired_after = ["release_v0_5_0_stable_publish"]',
  ].join("\n\n");

  const result = retireHistoricalCommandIntents(input);

  assert.deepEqual(result.removed, [
    "release_v0_5_2_stable_publish",
    "verify_marketplace_v0_5_2",
    "release_v0_5_1_stable_publish",
    "release_v0_5_0_stable_publish",
    "promote_v0_to_v0_5_0",
    "git_stage_source_pr_comment",
    "hosted_ci_release_version_guard",
    "git_commit_runner_admission_diagnostics",
    "git_stage_external_review_hardening",
    "git_commit_automation_test_build_contract",
    "git_stage_stable_v1_tooling",
    "git_commit_stable_v1_tooling",
    "git_stage_standalone_cli_package",
    "git_commit_standalone_cli_package",
    "git_stage_package_policy_sync",
    "git_commit_package_policy_sync",
    "git_stage_workspace_package_policy_diagnostics",
    "git_commit_workspace_package_policy_diagnostics",
    "git_stage_readme_cli_publication_status",
    "git_commit_readme_cli_publication_status",
    "git_stage_implementation_tracker_state_sync",
    "git_commit_implementation_tracker_state_sync",
    "git_stage_provider_model_eval",
    "hosted_ci_provider_model_eval",
    "git_stage_remaining_hardening",
    "git_stage_comment_endpoint_hardening",
    "git_commit_proposal_branch_race_reconciliation",
  ]);
  assert.deepEqual(result.manualOnly, [
    "release_v0_5_2_post_tag_evidence",
    "release_v0_5_1_post_tag_evidence",
    "release_v0_5_0_post_tag_evidence",
  ]);
  assert.ok(!result.text.includes("release_v0_5_1_stable_publish"));
  assert.ok(!result.text.includes("release_v0_5_0_stable_publish"));
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
