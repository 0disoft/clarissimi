import type { PreparedEvidenceItem } from "@clarissimi/core";

export const PERFORMANCE_CLAIM_PATTERN =
  /\b(?:faster|speedup|speed|latency|throughput|memory|runtime|performance|benchmark(?:ed)?)\b|지연(?:\s*시간)?|처리\s*(?:속도|량)|응답\s*(?:시간|속도)|메모리|실행\s*시간|성능|벤치마크|빨라|빠르/i;
const MEASUREMENT_CONTEXT_PATTERN =
  /\b(?:measur(?:ed|ement|ements)|results?|observed)\b|측정|실측|결과/i;
const METRIC_PATTERNS = [
  ["latency", /\blatency\b|지연(?:\s*시간)?|응답\s*시간/gi],
  ["throughput", /\b(?:throughput|rps|qps)\b|처리량/gi],
  ["memory", /\bmemory\b|메모리/gi],
  ["runtime", /\b(?:runtime|execution time|duration)\b|실행\s*시간|소요\s*시간/gi],
  ["speed", /\b(?:faster|speedup|speed)\b|속도|빨라|빠르/gi],
  ["performance", /\bperformance\b|성능/gi],
] as const;
const NUMBER_PATTERN =
  /(?<![\w.+-])([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|percent\b|퍼센트|x\b|×|배|ms\b|milliseconds?\b|밀리초|seconds?\b|s\b|초|ns\b|us\b|µs|[kmgt]?i?b\b|bytes?\b|(?:ops|requests)\/s\b)?/giu;

interface MeasurementValue {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
}

export interface NumericPerformanceClaim {
  readonly start: number;
  readonly end: number;
  readonly values: readonly MeasurementValue[];
}

export function numericPerformanceClaims(text: string): NumericPerformanceClaim[] {
  return [...text.matchAll(/[\s\S]+?(?:[.!?](?=\s|$)|$)/g)].flatMap((sentence) => {
    if (!PERFORMANCE_CLAIM_PATTERN.test(sentence[0])) return [];
    const values = measurementValues(sentence[0]);
    return values.length === 0
      ? []
      : [{ start: sentence.index, end: sentence.index + sentence[0].length, values }];
  });
}

export function supportsNumericPerformanceClaim(
  item: PreparedEvidenceItem,
  claim: NumericPerformanceClaim,
): boolean {
  // File paths identify candidates, never a measured result by themselves.
  const content = [item.title, item.excerpt, item.text].filter(Boolean).join(" ");
  return [...content.matchAll(/[\s\S]+?(?:[.!?](?=\s|$)|$)/g)].some((sentence) => {
    if (!MEASUREMENT_CONTEXT_PATTERN.test(sentence[0])) return false;
    const observed = measurementValues(sentence[0]);
    return claim.values.every((value) =>
      observed.some(
        (other) =>
          other.metric === value.metric && other.value === value.value && other.unit === value.unit,
      ),
    );
  });
}

function measurementValues(text: string): MeasurementValue[] {
  const metrics = METRIC_PATTERNS.flatMap(([metric, pattern]) =>
    [...text.matchAll(pattern)].map((match) => ({ metric, index: match.index })),
  ).sort((left, right) => left.index - right.index);
  let metricIndex = 0;
  return [...text.matchAll(NUMBER_PATTERN)].flatMap((match) => {
    while ((metrics[metricIndex]?.index ?? Infinity) <= match.index) metricIndex += 1;
    const context = metrics[Math.max(0, metricIndex - 1)];
    if (context === undefined) return [];
    const unit = (match[2] ?? "").toLowerCase();
    return [
      {
        metric: context.metric,
        value: Number(match[1]!.replaceAll(",", "")),
        unit: normalizeUnit(unit),
      },
    ];
  });
}

function normalizeUnit(unit: string): string {
  if (["percent", "퍼센트"].includes(unit)) return "%";
  if (["x", "×", "배"].includes(unit)) return "x";
  if (["millisecond", "milliseconds", "밀리초"].includes(unit)) return "ms";
  if (["second", "seconds", "초"].includes(unit)) return "s";
  return unit;
}
