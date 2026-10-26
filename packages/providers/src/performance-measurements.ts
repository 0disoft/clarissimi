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
const CLAUSE_SEPARATOR = /[;,](?=\s)|\b(?:and|but|while|whereas)\b|그리고|하지만|반면/;
const NEGATED_CHANGE_PATTERN =
  /\b(?:not|no|never|neither|without|unchanged|failed\s+to)\b|n['’]t\b|않|못|아니|없/i;
const DECREASE_PATTERN =
  /\b(?:reduc(?:e[ds]?|ing|tion)|decreas(?:e[ds]?|ing)|lower(?:ed|ing)?|drop(?:ped|s|ping)?|fell|fallen|fall(?:s|ing)?|cut(?:s|ting)?|shrank|shrink(?:s|ing)?)\b|감소|줄|낮|축소/i;
const INCREASE_PATTERN =
  /\b(?:increas(?:e[ds]?|ing)|rais(?:e[ds]?|ing)|higher|rose|risen|ris(?:e[sd]?|ing)|grew|grown|grow(?:s|ing)?|boost(?:ed|s|ing)?)\b|증가|늘|높|상승/i;
const IMPROVEMENT_PATTERN =
  /\b(?:improv(?:e[ds]?|ing|ement)|better|faster|speedup)\b|개선|향상|빨라|빠르/i;
const DEGRADATION_PATTERN =
  /\b(?:worse|worsen(?:ed|s|ing)?|slower|degrad(?:e[ds]?|ing|ation))\b|악화|느려|느리|저하/i;

type MeasurementChange = "absolute" | "decrease" | "increase";

interface MeasurementValue {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly change: MeasurementChange | undefined;
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
          value.change !== undefined &&
          other.metric === value.metric &&
          other.value === value.value &&
          other.unit === value.unit &&
          other.change === value.change,
      ),
    );
  });
}

function measurementValues(text: string): MeasurementValue[] {
  return text.split(CLAUSE_SEPARATOR).flatMap(clauseMeasurements);
}

function clauseMeasurements(text: string): MeasurementValue[] {
  const metrics = METRIC_PATTERNS.flatMap(([metric, pattern]) =>
    [...text.matchAll(pattern)].map((match) => ({ metric, index: match.index })),
  ).sort((left, right) => left.index - right.index);
  const numbers = [...text.matchAll(NUMBER_PATTERN)];
  const metricNames = [...new Set(metrics.map(({ metric }) => metric))];
  const unambiguous = numbers.length === 1 && metricNames.length === 1;
  const changes = new Map(
    metricNames.map((metric) => [metric, measurementChange(text, metric, unambiguous)]),
  );
  let metricIndex = 0;
  return numbers.flatMap((match) => {
    while ((metrics[metricIndex]?.index ?? Infinity) <= match.index) metricIndex += 1;
    const context = metrics[Math.max(0, metricIndex - 1)];
    const unit = (match[2] ?? "").toLowerCase();
    return [
      {
        metric: context?.metric ?? "",
        value: Number(match[1]!.replaceAll(",", "")),
        unit: normalizeUnit(unit),
        change: changes.get(context?.metric ?? ""),
      },
    ];
  });
}

function measurementChange(
  text: string,
  metric: string,
  unambiguous: boolean,
): MeasurementChange | undefined {
  if (NEGATED_CHANGE_PATTERN.test(text)) return undefined;
  const lowerIsBetter = ["latency", "memory", "runtime"].includes(metric);
  const improvement = IMPROVEMENT_PATTERN.test(text);
  const degradation = DEGRADATION_PATTERN.test(text);
  const decrease = DECREASE_PATTERN.test(text) || (lowerIsBetter ? improvement : degradation);
  const increase = INCREASE_PATTERN.test(text) || (lowerIsBetter ? degradation : improvement);
  // Do not guess which value/metric a change describes, or resolve conflicting changes.
  if (decrease && increase) return undefined;
  if (!decrease && !increase) return "absolute";
  if (!unambiguous) return undefined;
  return decrease ? "decrease" : "increase";
}

function normalizeUnit(unit: string): string {
  if (["percent", "퍼센트"].includes(unit)) return "%";
  if (["x", "×", "배"].includes(unit)) return "x";
  if (["millisecond", "milliseconds", "밀리초"].includes(unit)) return "ms";
  if (["second", "seconds", "초"].includes(unit)) return "s";
  return unit;
}
