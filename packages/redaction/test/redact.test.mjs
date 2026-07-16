import assert from "node:assert/strict";
import test from "node:test";

import {
  REDACTION_PLACEHOLDER,
  mergeRedactionReports,
  redactJson,
  redactText,
} from "../dist/index.js";

test("redacts email addresses without changing surrounding evidence text", () => {
  const address = `dev@${["example", "invalid"].join(".")}`;
  const result = redactText(`Maintainer note from person at ${address}.`);

  assert.equal(result.text, `Maintainer note from person at ${REDACTION_PLACEHOLDER}.`);
  assert.equal(result.report.changed, true);
  assert.equal(result.report.occurrences[0].kind, "email");
});

test("redacts environment-style secret assignments", () => {
  const keyName = ["OPENAI", "API", "KEY"].join("_");
  const result = redactText(`${keyName}=sample-value-for-tests`);

  assert.equal(result.text, `${REDACTION_PLACEHOLDER}`);
  assert.equal(result.report.changed, true);
  assert.equal(result.report.occurrences[0].kind, "env_assignment");
});

test("redacts quoted dotenv values and quoted generic assignments", () => {
  const dotenv = redactText('API_KEY="sample value for tests"');
  const generic = redactText('"token=synthetic-generic-secret"');

  assert.equal(dotenv.text, REDACTION_PLACEHOLDER);
  assert.equal(dotenv.report.occurrences[0].kind, "env_assignment");
  assert.equal(generic.text, REDACTION_PLACEHOLDER);
  assert.equal(generic.report.occurrences[0].kind, "generic_secret_assignment");
});

test("redacts unquoted generic secret assignments", () => {
  const result = redactText("password=synthetic-generic-secret");

  assert.equal(result.text, REDACTION_PLACEHOLDER);
  assert.equal(result.report.occurrences[0].kind, "generic_secret_assignment");
});

test("redacts provider token patterns", () => {
  const openai = `sk-proj-${"a".repeat(16)}`;
  const anthropic = `sk-ant-${"b".repeat(16)}`;
  const gemini = `AIza${"c".repeat(24)}`;
  const result = redactText(`${openai} ${anthropic} ${gemini}`);

  assert.equal(
    result.text,
    `${REDACTION_PLACEHOLDER} ${REDACTION_PLACEHOLDER} ${REDACTION_PLACEHOLDER}`,
  );
  assert.deepEqual(
    result.report.occurrences.map((occurrence) => occurrence.kind),
    ["openai_token", "anthropic_token", "gemini_token"],
  );
});

test("redacts private key blocks", () => {
  const marker = `${"PRIVATE"} KEY`;
  const result = redactText(
    [
      "before",
      `-----BEGIN ${marker}-----`,
      "synthetic-key-material",
      `-----END ${marker}-----`,
      "after",
    ].join("\n"),
  );

  assert.equal(result.text, `before\n${REDACTION_PLACEHOLDER}\nafter`);
  assert.equal(result.report.occurrences[0].kind, "private_key_block");
});

test("redacts nested JSON values but preserves object shape", () => {
  const address = `contributor@${["example", "invalid"].join(".")}`;
  const result = redactJson({
    title: "Merged PR",
    body: `Reported by ${address}`,
    labels: ["bug", "TOKEN=synthetic-value"],
  });

  assert.deepEqual(result.value, {
    title: "Merged PR",
    body: `Reported by ${REDACTION_PLACEHOLDER}`,
    labels: ["bug", REDACTION_PLACEHOLDER],
  });
  assert.equal(result.report.occurrences.length, 2);
});

test("reports unchanged text without false positives", () => {
  const result = redactText("Added regression coverage for parser crash.");

  assert.equal(result.text, "Added regression coverage for parser crash.");
  assert.equal(result.report.changed, false);
  assert.deepEqual(result.report.occurrences, []);
});

test("merges reports without leaking matched values", () => {
  const address = `person@${["example", "invalid"].join(".")}`;
  const one = redactText(address).report;
  const two = redactText("API_KEY='synthetic-value'").report;
  const merged = mergeRedactionReports([one, two]);

  assert.equal(merged.changed, true);
  assert.equal(merged.occurrences.length, 2);
  assert.equal(
    merged.occurrences.every((occurrence) => occurrence.replacement === REDACTION_PLACEHOLDER),
    true,
  );
});
