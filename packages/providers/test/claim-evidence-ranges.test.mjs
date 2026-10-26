import assert from "node:assert/strict";
import test from "node:test";

import { overlappingClaimLinks } from "../dist/claim-evidence-ranges.js";

test("claim ranges preserve strict overlap boundaries, gaps, order, and original entries", () => {
  const links = [
    { start: 0, end: 3 },
    { start: 4, end: 9 },
    { start: 10, end: 14 },
  ];
  for (let start = -1; start <= 15; start += 1) {
    for (let end = start + 1; end <= 16; end += 1) {
      const expected = links.filter((link) => link.start < end && link.end > start);
      const actual = overlappingClaimLinks(links, start, end);
      assert.deepEqual(actual, expected, `range ${start}:${end}`);
      actual.forEach((entry, index) => assert.equal(entry, expected[index]));
    }
  }
  assert.deepEqual(overlappingClaimLinks([], 0, 1), []);
});

test("claim ranges match a linear reference across uneven adjacent link lengths", () => {
  let offset = 0;
  const links = Array.from({ length: 97 }, (_, index) => {
    const start = offset;
    offset += ((index * 17) % 31) + 2;
    return { start, end: offset - 1 };
  });
  for (let start = 0; start < offset; start += 7) {
    for (const length of [1, 3, 31, 127, offset]) {
      const end = start + length;
      assert.deepEqual(
        overlappingClaimLinks(links, start, end),
        links.filter((link) => link.start < end && link.end > start),
      );
    }
  }
});

test("a late claim probes logarithmically instead of scanning every link", () => {
  const length = 16_384;
  let probes = 0;
  const links = Array.from({ length }, (_, index) => ({
    get start() {
      probes += 1;
      return index * 4;
    },
    get end() {
      probes += 1;
      return index * 4 + 2;
    },
  }));
  const actual = overlappingClaimLinks(links, (length - 2) * 4, (length - 2) * 4 + 1);
  assert.equal(actual.length, 1);
  assert.equal(actual[0], links[length - 2]);
  assert.ok(probes <= Math.ceil(Math.log2(length)) + 3, `${probes} endpoint probes`);
});
