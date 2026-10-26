interface TextRange {
  readonly start: number;
  readonly end: number;
}

// Schema-validated link texts produce ordered, disjoint ranges within each field.
export function overlappingClaimLinks<T extends TextRange>(
  links: readonly T[],
  start: number,
  end: number,
): T[] {
  let low = 0;
  let high = links.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (links[middle]!.end <= start) low = middle + 1;
    else high = middle;
  }
  const overlaps: T[] = [];
  for (let index = low; index < links.length; index += 1) {
    const link = links[index]!;
    if (link.start >= end) break;
    overlaps.push(link);
  }
  return overlaps;
}
