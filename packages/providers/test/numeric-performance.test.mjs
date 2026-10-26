import assert from "node:assert/strict";
import test from "node:test";

import { prepareEvidenceForProvider } from "@clarissimi/core";
import { ASSESSMENT_SCHEMA_VERSION } from "@clarissimi/schemas";

import { collectMergedPullRequestEvidence } from "../../github/dist/index.js";
import { validateProviderAssessmentResult } from "../dist/index.js";

const contributor = {
  platform: "github",
  id: "123456",
  login: "octocat",
  profileUrl: "https://github.com/octocat",
};
const source = {
  repository: "example/project",
  event: "merged_pull_request",
  pullRequestNumber: 42,
};
const measured = "Measured results: parser latency reduced by 99%.";
const cases = [
  ["English claim without results", "Reduced latency by 99%.", undefined, false],
  ["Korean claim without results", "처리 지연을 99% 줄였습니다.", undefined, false],
  ["English matching results", "Reduced latency by 99%.", measured, true],
  ["Korean matching results", "처리 지연을 99% 줄였습니다.", measured, true],
  ["different percentage", "Reduced latency by 99%.", "Measured latency reduced by 9%.", false],
  ["percentage substring", "Reduced latency by 99%.", "Measured latency reduced by 199%.", false],
  ["wrong metric", "Reduced latency by 99%.", "Measured memory reduced by 99%.", false],
  ["no measurement context", "Reduced latency by 99%.", "Target latency reduction: 99%.", false],
  ["decimal values", "Reduced latency by 9.5%.", "Measured latency reduced by 9.5%.", true],
  ["different decimals", "Reduced latency by 9.5%.", "Measured latency reduced by 19.5%.", false],
  ["Korean units", "메모리 사용량을 20퍼센트 줄였습니다.", "측정 결과 메모리 20% 감소.", true],
  ["time-unit spellings", "Latency is 5 milliseconds.", "Measured latency is 5 ms.", true],
  ["different units", "Latency is 5 ms.", "Measured latency is 5 s.", false],
  ["no automatic conversions", "Latency is 1 s.", "Measured latency is 1000 ms.", false],
  [
    "unrelated measurement sentence",
    "Reduced latency by 99%.",
    "Measured memory reduced by 99%. Latency improved.",
    false,
  ],
  ["named benchmark alone", "Reduced latency by 99%.", "function benchmark() {}", false],
  [
    "opposite latency change",
    "Reduced latency by 99%.",
    "Measured latency increased by 99%.",
    false,
  ],
  [
    "opposite Korean change",
    "처리 지연을 99% 줄였습니다.",
    "측정 결과 처리 지연이 99% 증가했습니다.",
    false,
  ],
  [
    "negated decrease",
    "Reduced latency by 99%.",
    "Measured latency did not decrease by 99%.",
    false,
  ],
  ["opposite memory change", "Reduced memory by 20%.", "Measured memory increased by 20%.", false],
  [
    "Korean negation",
    "메모리를 20% 줄였습니다.",
    "측정 결과 메모리를 20% 줄이지 못했습니다.",
    false,
  ],
  [
    "contracted negation",
    "Reduced latency by 99%.",
    "Measured latency didn't decrease by 99%.",
    false,
  ],
  [
    "negated claim",
    "Latency did not decrease by 99%.",
    "Measured latency decreased by 99%.",
    false,
  ],
  ["matching increase", "Increased throughput by 20%.", "Measured throughput rose by 20%.", true],
  [
    "matching Korean increase",
    "처리량이 20% 늘었습니다.",
    "측정 결과 처리량이 20% 증가했습니다.",
    true,
  ],
  [
    "opposite throughput change",
    "Increased throughput by 20%.",
    "Measured throughput fell by 20%.",
    false,
  ],
  ["latency improvement", "Improved latency by 20%.", "Measured latency decreased by 20%.", true],
  [
    "throughput improvement",
    "Improved throughput by 20%.",
    "Measured throughput increased by 20%.",
    true,
  ],
  [
    "opposite improvement",
    "Improved throughput by 20%.",
    "Measured throughput decreased by 20%.",
    false,
  ],
  [
    "absolute value is not a change",
    "Reduced latency by 5 ms.",
    "Measured latency is 5 ms.",
    false,
  ],
  [
    "change is not an absolute value",
    "Latency is 5 ms.",
    "Measured latency decreased by 5 ms.",
    false,
  ],
  ["matching speed", "Parser is 2x faster.", "Measured parser speed improved 2x.", true],
  ["opposite speed", "Parser is 2x faster.", "Measured parser speed is 2x slower.", false],
  [
    "unrelated metric direction",
    "Reduced latency by 20%.",
    "Measured memory decreased 20%; latency is 20%.",
    false,
  ],
  [
    "ambiguous direction",
    "Reduced latency by 20%.",
    "Measured latency increased or decreased 20%.",
    false,
  ],
  [
    "ambiguous value association",
    "Reduced latency by 5 ms.",
    "Measured latency is 5 ms (20% lower).",
    false,
  ],
  [
    "unbound value after a conjunction",
    "Reduced latency by 20% and 30%.",
    "Measured latency decreased 20%.",
    false,
  ],
  [
    "directions stay with their metrics",
    "Latency decreased 20% and throughput increased 10%.",
    "Measured latency dropped 20% and throughput rose 10%.",
    true,
  ],
  [
    "reversed metric directions",
    "Latency decreased 20% and throughput increased 10%.",
    "Measured latency rose 20% and throughput dropped 10%.",
    false,
  ],
  [
    "direction cannot cross unseparated metrics",
    "Reduced latency by 20%.",
    "Measured memory decreased with latency at 20%.",
    false,
  ],
];

for (const [name, claim, excerpt, expected] of cases) {
  test(`numeric performance: ${name}`, () => {
    const result = validate(claim, excerpt);
    assert.equal(result.ok, expected, JSON.stringify(result.issues));
    if (!expected)
      assert.ok(
        result.issues.some(
          (issue) => issue.code === "provider_result_performance_measurement_missing",
        ),
      );
  });
}

test("numeric performance support must be linked to every segment of a split claim", () => {
  const result = validate("Reduced latency by 99%.", measured, { split: true });
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "provider_result_performance_measurement_missing"),
  );
});

const filenameClaim = "benchmarks/results/latency reduced by 99%.json";
const metadataCases = [
  ["filename without content", { id: filenameClaim, title: filenameClaim }, false],
  [
    "filename with generic content",
    { id: filenameClaim, title: filenameClaim, excerpt: "Benchmark implementation only." },
    false,
  ],
  [
    "measurement marker only in title",
    { title: "Measured results", excerpt: "Latency reduced by 99%." },
    false,
  ],
  [
    "measurement value only in title",
    { title: "Latency reduced by 99%", excerpt: "Measured results." },
    false,
  ],
  ["complete measurement only in title", { title: measured }, false],
  [
    "maintainer note title only",
    { kind: "maintainer_note", id: "benchmark-run", title: measured },
    false,
  ],
  ["test title only", { kind: "test", id: "benchmark-run", title: measured }, false],
  [
    "conflicting title with measured excerpt",
    { title: "Measured latency increased by 99%", excerpt: measured },
    true,
  ],
  ["measured text without excerpt", { title: "Benchmark results", text: measured }, true],
  [
    "Korean measured excerpt",
    { title: filenameClaim, excerpt: "측정 결과 처리 지연이 99% 감소했습니다." },
    true,
  ],
];

for (const [name, evidenceItem, expected] of metadataCases) {
  test(`numeric measurement content boundary: ${name}`, () => {
    const result = validate("Reduced latency by 99%.", undefined, { evidenceItem });
    assert.equal(result.ok, expected, JSON.stringify(result.issues));
    if (!expected)
      assert.ok(
        result.issues.some(
          (issue) => issue.code === "provider_result_performance_measurement_missing",
        ),
      );
  });
}

test("GitHub changed-file names cannot supply numeric measurement content", () => {
  const collected = collectMergedPullRequestEvidence({
    repository: { fullName: source.repository },
    pullRequest: {
      number: source.pullRequestNumber,
      title: "Update parser benchmark",
      user: contributor,
      changedFiles: [{ filename: filenameClaim }],
    },
  });
  const evidenceItem = collected.evidence.items.find((item) => item.id === filenameClaim);
  assert.equal(evidenceItem.title, filenameClaim);
  assert.equal(evidenceItem.excerpt, "changed");
  const result = validate("Reduced latency by 99%.", undefined, { evidenceItem });
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "provider_result_performance_measurement_missing"),
  );
});

for (const [name, excerpt, expected] of [
  ["matching", "Measured latency is 5 ms.", true],
  ["nonmatching", "Measured memory is 5 MB.", false],
  ["empty", undefined, false],
]) {
  test(`numeric measurement parsing is reused for ${name} evidence across both fields`, () => {
    let reads = 0;
    const result = validate(Array(20).fill("Latency is 5 ms.").join(" "), excerpt, {
      onPrepared(input) {
        Object.defineProperty(input.preparedEvidence.items[0], "excerpt", {
          get() {
            reads += 1;
            return excerpt;
          },
        });
      },
    });
    assert.equal(result.ok, expected);
    assert.equal(reads, 1);
  });
}

test("numeric measurement parsing resumes for later claims without combining evidence sentences", () => {
  const excerpt = "Measured latency is 5 ms. Observed memory is 20 MB.";
  assert.equal(validate("Latency is 5 ms. Memory is 20 MB.", excerpt).ok, true);
  assert.equal(validate("Latency is 5 ms and memory is 20 MB.", excerpt).ok, false);
});

test("numeric measurement parsing is fresh for each validation", () => {
  let captured;
  assert.equal(
    validate("Latency is 5 ms.", "Measured latency is 5 ms.", {
      onPrepared(input, assessment) {
        captured = { input, assessment };
      },
    }).ok,
    true,
  );
  captured.input.preparedEvidence.items[0].excerpt = "Measured latency is 6 ms.";
  captured.input.preparedEvidence.evidenceRefs[0].excerpt = "Measured latency is 6 ms.";
  assert.equal(validateProviderAssessmentResult(captured.input, captured.assessment).ok, false);
  captured.input.preparedEvidence.items[0].excerpt = "Measured latency is 5 ms.";
  captured.input.preparedEvidence.evidenceRefs[0].excerpt = "Measured latency is 5 ms.";
  assert.equal(validateProviderAssessmentResult(captured.input, captured.assessment).ok, true);
});

function validate(claim, excerpt, { split = false, evidenceItem = {}, onPrepared } = {}) {
  const preparedEvidence = prepareEvidenceForProvider({
    source,
    items: [
      {
        kind: "file",
        id: "benchmarks/parser.ts",
        ...(excerpt === undefined ? {} : { excerpt }),
        ...evidenceItem,
      },
      { kind: "file", id: "src/parser.ts" },
    ],
  });
  const input = { contributor, preparedEvidence };
  const assessment = {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    contributor,
    source,
    contributionType: "performance",
    affectedArea: "parser",
    impactLevel: "low",
    evidenceSummary: claim,
    publicRecognitionText: claim,
    suggestedBadge: "Parser Care",
    confidence: 0.7,
    maintainerApprovalStatus: "draft",
    evidenceRefs: preparedEvidence.evidenceRefs,
    claimEvidenceLinks: ["evidenceSummary", "publicRecognitionText"].flatMap((field) =>
      split
        ? [
            { field, text: "Reduced latency by", evidenceRefIndexes: [0] },
            { field, text: "99%.", evidenceRefIndexes: [1] },
          ]
        : [{ field, text: claim, evidenceRefIndexes: [0] }],
    ),
  };
  onPrepared?.(input, assessment);
  return validateProviderAssessmentResult(input, assessment);
}
