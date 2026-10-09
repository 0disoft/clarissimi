import assert from "node:assert/strict";
import test from "node:test";

import {
  RendererValidationError,
  buildMaintainerRecentRecognitionShareDocument,
} from "../dist/index.js";

test("analytics rejects windows outside the supported date range with a validation issue", () => {
  for (const options of [
    { asOf: "1970-01-01T00:00:00.000Z", windowDays: 100000001 },
    { asOf: "2026-10-09T00:00:00.000Z", windowDays: Number.MAX_SAFE_INTEGER },
    { asOf: "-271821-04-20T00:00:00.000Z", windowDays: 1 },
  ]) {
    assert.throws(
      () => buildMaintainerRecentRecognitionShareDocument([], options),
      (error) =>
        error instanceof RendererValidationError &&
        error.issues.some(
          (issue) => issue.path === "$.windowDays" && issue.code === "invalid_window_days",
        ),
    );
  }
});

test("analytics accepts a window starting exactly at the earliest supported date", () => {
  const document = buildMaintainerRecentRecognitionShareDocument([], {
    asOf: "1970-01-01T00:00:00.000Z",
    windowDays: 100000000,
  });
  assert.equal(document.window.startsAt, "-271821-04-20T00:00:00.000Z");
  assert.equal(document.window.includedRecords, 0);
});
