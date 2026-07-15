import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import { ASSESSMENT_SCHEMA_VERSION } from "@clarissimi/schemas";

import { validateProviderAssessmentResult } from "../dist/index.js";

const corpusUrl = new URL("./fixtures/result-quality-dirty-corpus.json", import.meta.url);
const corpus = JSON.parse(await readFile(corpusUrl, "utf8"));
const statuses = new Set(["candidate", "promoted", "quarantined"]);
const forbiddenKeys =
  /^(?:raw|prompt|response|patch|body|token|secret|email|url|accountId|requestId)$/i;
const secretLikeContent = /(?:\bBearer\s+|\bgh[opsu]_[A-Za-z0-9]+|\bsk-[A-Za-z0-9_-]+)/;

test("provider result dirty corpus has a privacy-safe non-gating intake contract", () => {
  assert.equal(corpus.schemaVersion, "clarissimi.provider-result-quality-dirty-corpus/v1");
  assert.deepEqual(corpus.dataset, {
    kind: "dirty",
    releaseGate: false,
    caseSource: "scrubbed-observed-failure",
    defaultStatus: "candidate",
    rawContent: "forbidden",
  });
  assert.equal(Array.isArray(corpus.cases), true);
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, corpus.cases.length);
  assertDirtyCorpusSafe(corpus);
});

test("provider result dirty corpus contract rejects raw provider fields", () => {
  const unsafeCorpus = structuredClone(corpus);
  unsafeCorpus.cases.push({
    id: "unsafe-fixture",
    status: "candidate",
    provenance: {
      kind: "scrubbed-observed-failure",
      referenceHash: `sha256:${"0".repeat(64)}`,
      scrubbed: true,
    },
    response: "provider output",
    items: [{ kind: "file", id: "src/example.ts" }],
    candidate: {},
    expectedIssueCodes: [],
  });

  assert.throws(() => assertDirtyCorpusSafe(unsafeCorpus), /forbidden key response/);
});

for (const [index, entry] of corpus.cases.entries()) {
  test(`provider result dirty corpus: ${entry.id}`, { skip: entry.status !== "promoted" }, () => {
    const source = {
      repository: "example/dirty-corpus",
      event: "merged_pull_request",
      pullRequestNumber: index + 1,
      mergedAt: `2026-07-${String((index % 12) + 1).padStart(2, "0")}T00:00:00.000Z`,
    };
    const preparedEvidence = prepareEvidenceForProvider({ source, items: entry.items });
    const input = {
      contributor: corpus.contributor,
      preparedEvidence,
      ...(entry.hints === undefined ? {} : { hints: entry.hints }),
    };
    const candidate = {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      contributor: corpus.contributor,
      ...corpus.baseCandidate,
      ...entry.candidate,
      evidenceRefs: preparedEvidence.evidenceRefs,
      maintainerApprovalStatus: "draft",
      source,
    };

    const result = validateProviderAssessmentResult(input, candidate);
    const actualCodes = [...new Set(result.issues.map((issue) => issue.code))].sort();
    assert.deepEqual(actualCodes, [...entry.expectedIssueCodes].sort());
  });
}

function assertDirtyCorpusSafe(value) {
  visit(value, "$");
  for (const entry of value.cases) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(statuses.has(entry.status), true);
    assert.deepEqual(entry.provenance?.kind, "scrubbed-observed-failure");
    assert.match(entry.provenance?.referenceHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.equal(entry.provenance?.scrubbed, true);
    assert.equal(Array.isArray(entry.items) && entry.items.length > 0, true);
    assert.equal(entry.candidate !== null && typeof entry.candidate === "object", true);
    assert.equal(Array.isArray(entry.expectedIssueCodes), true);
    if (entry.status === "quarantined") {
      assert.equal(typeof entry.quarantineReason === "string", true);
      assert.notEqual(entry.quarantineReason.trim(), "");
    }
  }
}

function visit(value, path) {
  if (typeof value === "string") {
    assert.doesNotMatch(value, secretLikeContent, `${path} contains secret-like content`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    assert.equal(forbiddenKeys.test(key), false, `${path} contains forbidden key ${key}`);
    visit(entry, `${path}.${key}`);
  }
}
