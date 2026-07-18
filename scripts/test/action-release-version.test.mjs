import assert from "node:assert/strict";
import test from "node:test";

import {
  actionMajorAliasForReleaseVersion,
  findAuthorizedActionReleaseReferences,
  findLatestAuthorizedActionReleaseVersion,
  isAuthorizedActionMajorAlias,
  isAuthorizedActionReleaseVersion,
  isMatchingActionMajorAlias,
  parseAuthorizedActionReleaseVersion,
} from "../action-release-version.mjs";

test("action release version contract accepts only authorized immutable v0 and v1 tags", () => {
  assert.deepEqual(parseAuthorizedActionReleaseVersion("v1.0.0"), {
    version: "v1.0.0",
    major: 1,
    minor: 0,
    patch: 0,
    alias: "v1",
  });
  assert.equal(isAuthorizedActionReleaseVersion("v0.5.2"), true);
  assert.equal(isAuthorizedActionReleaseVersion("v2.0.0"), false);
  assert.equal(isAuthorizedActionReleaseVersion("v1.0.0-rc.1"), false);
  assert.equal(isAuthorizedActionReleaseVersion("v01.0.0"), false);
});

test("action release version contract derives and matches the moving major alias", () => {
  assert.equal(actionMajorAliasForReleaseVersion("v0.5.2"), "v0");
  assert.equal(actionMajorAliasForReleaseVersion("v1.0.0"), "v1");
  assert.equal(isAuthorizedActionMajorAlias("v0"), true);
  assert.equal(isAuthorizedActionMajorAlias("v1"), true);
  assert.equal(isAuthorizedActionMajorAlias("v2"), false);
  assert.equal(isMatchingActionMajorAlias("v1", "v1.2.3"), true);
  assert.equal(isMatchingActionMajorAlias("v0", "v1.2.3"), false);
});

test("action release version contract finds only authorized consumer and Marketplace versions", () => {
  assert.deepEqual(
    findAuthorizedActionReleaseReferences(
      "0disoft/clarissimi@v0.5.2 0disoft/clarissimi@v1.0.0 0disoft/clarissimi@v2.0.0",
      "0disoft/clarissimi",
    ),
    ["v0.5.2", "v1.0.0"],
  );
  assert.equal(findLatestAuthorizedActionReleaseVersion("v2.0.0 Latest v1.0.0 Latest"), "v1.0.0");
});
