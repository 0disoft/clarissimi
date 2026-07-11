import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveProviderSmokeChildEnv,
  runLiveProviderSmoke,
} from "../live-provider-smoke.mjs";

test("live provider smoke can be imported without executing provider preflight", () => {
  assert.equal(typeof runLiveProviderSmoke, "function");
});

test("live provider smoke child env strips unrelated provider and GitHub credentials", () => {
  const keySuffix = "_KEY";
  const baseEnv = {
    Path: "C:\\Windows\\System32",
    SystemRoot: "C:\\Windows",
    CLARISSIMI_PROVIDER_MODEL: "unit-model",
    NODE_AUTH_TOKEN: "node-token",
    ["OPENAI_API" + keySuffix]: "openai-token",
    ["ANTHROPIC_API" + keySuffix]: "anthropic-token",
    ["GEMINI_API" + keySuffix]: "gemini-token",
    ["DEEPSEEK_API" + keySuffix]: "deepseek-token",
    ["OPENCODE_GO_API" + keySuffix]: "opencode-token",
    ["UMANS_API" + keySuffix]: "umans-token",
    GITHUB_TOKEN: "github-token",
    GITHUB_PAT: "github-pat",
    GITHUB_PAT_ODISOFT: "github-pat-odisoft",
  };

  const childEnv = buildLiveProviderSmokeChildEnv(baseEnv, {
    CLARISSIMI_PROVIDER_TOKEN: "clarissimi-provider-token",
  });

  assert.equal(childEnv.Path, "C:\\Windows\\System32");
  assert.equal(childEnv.SystemRoot, "C:\\Windows");
  assert.equal(childEnv.CLARISSIMI_PROVIDER_MODEL, "unit-model");
  assert.equal(childEnv.CLARISSIMI_PROVIDER_TOKEN, "clarissimi-provider-token");
  assert.equal(childEnv.NODE_AUTH_TOKEN, undefined);
  assert.equal(childEnv["OPENAI_API" + keySuffix], undefined);
  assert.equal(childEnv["ANTHROPIC_API" + keySuffix], undefined);
  assert.equal(childEnv["GEMINI_API" + keySuffix], undefined);
  assert.equal(childEnv["DEEPSEEK_API" + keySuffix], undefined);
  assert.equal(childEnv["OPENCODE_GO_API" + keySuffix], undefined);
  assert.equal(childEnv["UMANS_API" + keySuffix], undefined);
  assert.equal(childEnv.GITHUB_TOKEN, undefined);
  assert.equal(childEnv.GITHUB_PAT, undefined);
  assert.equal(childEnv.GITHUB_PAT_ODISOFT, undefined);
});

test("live provider smoke child env matches denied names case-insensitively", () => {
  const childEnv = buildLiveProviderSmokeChildEnv(
    {
      github_token: "github-token",
      openai_api_key: "openai-token",
      TEMP: "C:\\Temp",
    },
    {
      CLARISSIMI_PROVIDER_TOKEN: "clarissimi-provider-token",
    },
  );

  assert.equal(childEnv.github_token, undefined);
  assert.equal(childEnv.openai_api_key, undefined);
  assert.equal(childEnv.TEMP, "C:\\Temp");
  assert.equal(childEnv.CLARISSIMI_PROVIDER_TOKEN, "clarissimi-provider-token");
});
