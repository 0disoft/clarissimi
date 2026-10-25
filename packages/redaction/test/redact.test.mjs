import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("email redaction preserves legacy boundaries, greedy matches, and occurrence offsets", () => {
  const locals = ["dev", ".dev", "+dev", "_", "---", "a.b", "a+b", "a..b", "%dev"];
  const domains = [
    "example.invalid",
    "x.y",
    "x.co_",
    "x.co-word",
    "x..com",
    "x.com.",
    "x.c0m",
    "a@b.invalid",
  ];
  const suffixes = ["", ".", "_", "é", "+next@other.invalid", "-next@other.invalid"];
  for (const local of locals) {
    for (const domain of domains) {
      for (const suffix of suffixes) {
        const text = `before ${local}@${domain}${suffix} after`;
        const occurrences = [];
        const expected = text.replace(
          /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
          (match, start) => {
            occurrences.push({
              kind: "email",
              replacement: REDACTION_PLACEHOLDER,
              start,
              end: start + match.length,
            });
            return REDACTION_PLACEHOLDER;
          },
        );
        assert.deepEqual(redactText(text), {
          text: expected,
          report: { changed: occurrences.length > 0, occurrences },
        });
      }
    }
  }
});

test("email-like near misses cannot block redaction past the child-process deadline", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import assert from "node:assert/strict";
       import { redactText, REDACTION_PLACEHOLDER } from ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)};
       for (const suffix of ["", "@invalid", "@example.c"]) {
         const input = "a.".repeat(32_768) + suffix;
         assert.equal(redactText(input).text, input);
       }
       const input = "a.".repeat(262_144) + " user@example.invalid";
       assert.equal(redactText(input).text, "a.".repeat(262_144) + " " + REDACTION_PLACEHOLDER);`,
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
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

test("quoted credential keys are masked with their original occurrence offsets", () => {
  const fields = ["token", "secret", "password", "api_key", "api-key", "apiKey", "API_KEY"];
  const marker = "synthetic-quoted-json-value";
  const cases = [];
  for (const field of fields) {
    for (const keyQuote of ['"', "'"]) {
      for (const separator of [":", "="]) {
        for (const valueQuote of ['"', "'"]) {
          const assignment = `${keyQuote}${field}${keyQuote} ${separator} ${valueQuote}${marker}${valueQuote}`;
          const prefix = "before { ";
          cases.push({ input: `${prefix}${assignment} } after`, start: prefix.length, assignment });
        }
      }
    }
  }
  const results = cases.map(({ input }) => redactText(input));
  assert.equal(results.filter((result) => !result.text.includes(marker)).length, cases.length);
  for (const [index, result] of results.entries()) {
    assert.deepEqual(result, {
      text: `before { ${REDACTION_PLACEHOLDER} } after`,
      report: {
        changed: true,
        occurrences: [
          {
            kind: "generic_secret_assignment",
            replacement: REDACTION_PLACEHOLDER,
            start: cases[index].start,
            end: cases[index].start + cases[index].assignment.length,
          },
        ],
      },
    });
  }
  for (const field of ["tokenCount", "secretary", "passwordHint", "api_key_rotation"]) {
    const input = JSON.stringify({ [field]: marker });
    assert.equal(redactText(input).text, input);
  }
  assert.equal(redactText('{"token":"1234567"}').report.changed, false);
  assert.equal(redactText('{"token":"12345678"}').text, `{${REDACTION_PLACEHOLDER}}`);
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

test("redacts all GitHub credential families in prose and nested JSON", () => {
  for (const prefix of ["ghp", "gho", "ghu", "ghs", "ghr", "github_pat"]) {
    const syntheticToken = `${prefix}_${"a".repeat(22)}_${"b".repeat(59)}`;
    const input = `Before (${syntheticToken}) after.`;
    const result = redactText(input);
    assert.equal(result.report.changed, true, prefix);
    assert.equal(result.text, `Before (${REDACTION_PLACEHOLDER}) after.`);
    assert.deepEqual(result.report.occurrences, [
      {
        kind: "github_token",
        replacement: REDACTION_PLACEHOLDER,
        start: 8,
        end: 8 + syntheticToken.length,
      },
    ]);
    const nested = redactJson({ notes: [input] });
    assert.deepEqual(nested.value, { notes: [`Before (${REDACTION_PLACEHOLDER}) after.`] });
    assert.equal(JSON.stringify({ result, nested }).includes(syntheticToken), false);
  }
});

test("GitHub token detection preserves prefix boundaries and minimum body length", () => {
  for (const text of [
    "github_pat_",
    "github_pat_documentation",
    `github_pat_${"a".repeat(15)}`,
    `xgithub_pat_${"a".repeat(30)}`,
  ]) {
    const result = redactText(text);
    assert.equal(result.text, text);
    assert.equal(result.report.changed, false);
  }
  assert.equal(redactText(`github_pat_${"a".repeat(16)}`).text, REDACTION_PLACEHOLDER);
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

test("private key scanning preserves legacy delimiters, nesting, overlaps, and offsets", () => {
  const prefixes = ["", "RSA ", "OPENSSH ", "EC ", "DSA ", "PGP ", "UNKNOWN "];
  for (const beginPrefix of prefixes) {
    for (const endPrefix of prefixes) {
      const begin = `-----BEGIN ${beginPrefix}PRIVATE KEY-----`;
      const end = `-----END ${endPrefix}PRIVATE KEY-----`;
      for (const input of [
        `before ${begin}\nsynthetic-key-material\n${end} after`,
        `🚀${end}${begin}inner${begin}nested${end} trailing${end} ${begin}unfinished`,
        `${end}${begin.slice(5)}synthetic-key-material${end}`,
        `${begin}${end.slice(5)}`,
        `${begin}one${end}${begin}two${end}`,
      ]) {
        const occurrences = [];
        const expected = input.replace(
          /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g,
          (match, start) => {
            occurrences.push({
              kind: "private_key_block",
              replacement: REDACTION_PLACEHOLDER,
              start,
              end: start + match.length,
            });
            return REDACTION_PLACEHOLDER;
          },
        );
        assert.deepEqual(redactText(input), {
          text: expected,
          report: { changed: occurrences.length > 0, occurrences },
        });
      }
    }
  }
});

test("unterminated private key headers cannot block redaction past the child-process deadline", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import assert from "node:assert/strict";
       import { redactText, REDACTION_PLACEHOLDER } from ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)};
       const tail = "-----BEGIN PRIVATE KEY-----\\n".repeat(16_384);
       assert.equal(redactText(tail).text, tail);
       const complete = "-----BEGIN RSA PRIVATE KEY-----\\nsynthetic-key-material\\n-----END PRIVATE KEY-----\\n";
       assert.equal(redactText(complete + tail).text, REDACTION_PLACEHOLDER + "\\n" + tail);
       assert.equal(redactText(tail + "-----END PRIVATE KEY-----").text, REDACTION_PLACEHOLDER);`,
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
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

test("redacts sensitive JSON keys regardless of value shape", () => {
  const result = redactJson({
    token: "synthetic-secret-value-123456789",
    authorization: "Bearer synthetic-secret-value-123456789",
    apiKey: "synthetic-secret-value-123456789",
    nested: {
      "set-cookie": ["session=synthetic-secret-value-123456789"],
    },
  });

  assert.deepEqual(result.value, {
    token: REDACTION_PLACEHOLDER,
    authorization: REDACTION_PLACEHOLDER,
    apiKey: REDACTION_PLACEHOLDER,
    nested: {
      "set-cookie": REDACTION_PLACEHOLDER,
    },
  });
  assert.equal(result.report.changed, true);
  assert.deepEqual(
    result.report.occurrences.map((occurrence) => occurrence.kind),
    Array(4).fill("sensitive_json_key"),
  );
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
