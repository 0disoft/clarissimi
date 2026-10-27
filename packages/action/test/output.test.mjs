import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeGitHubOutputs } from "../dist/output.js";

const summary = {
  ok: true,
  mode: "propose",
  inputSource: "github_fixture",
  draftCount: 1,
  proposedEntryCount: 0,
  skippedEntryCount: 0,
  approvalStatus: "draft",
  redactionMatchCount: 0,
  stagedFileCount: 1,
  proposalBranch: "clarissimi/review",
  proposalCommitSha: "a".repeat(40),
  proposalPullRequestNumber: 42,
  proposalPullRequestUrl: "https://github.com/sample/project/pull/42",
  proposalPullRequestAction: "created",
};

// Interpret the runner's EnvFileKeyValuePairs format, with last-write-wins keys.
// https://github.com/actions/runner/blob/main/src/Runner.Worker/FileCommandManager.cs
// Keep value byte offsets so CRLF and trailing newlines are checked losslessly.
function readOutputs(text) {
  const outputs = new Map();
  let offset = 0;
  function readLine() {
    const end = text.indexOf("\n", offset);
    assert.notEqual(end, -1, "Output command must end with a newline");
    const rawLine = text.slice(offset, end);
    const line = process.platform === "win32" ? rawLine.replace(/\r$/, "") : rawLine;
    offset = end + 1;
    return line;
  }
  while (offset < text.length) {
    const line = readLine();
    const equals = line.indexOf("=");
    const heredoc = line.indexOf("<<");
    if (equals >= 0 && (heredoc < 0 || equals < heredoc)) {
      outputs.set(line.slice(0, equals), line.slice(equals + 1));
    } else if (heredoc > 0) {
      const start = offset;
      let end = offset;
      while (readLine() !== line.slice(heredoc + 2)) end = offset;
      const valueEnd = end - (process.platform === "win32" && text[end - 2] === "\r" ? 2 : 1);
      outputs.set(line.slice(0, heredoc), text.slice(start, Math.max(start, valueEnd)));
    } else {
      assert.fail("Invalid output command");
    }
  }
  return outputs;
}

async function withOutput(run) {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-output-"));
  try {
    await run(join(dir, "output.txt"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("single-line outputs preserve their format, equals signs, and append behavior", async () => {
  await withOutput(async (path) => {
    await writeFile(path, "previous=preserved\n");
    await writeGitHubOutputs(path, summary, "artifacts/result=v1.json");
    const text = await readFile(path, "utf8");
    const outputs = readOutputs(text);
    assert.equal(outputs.get("previous"), "preserved");
    assert.equal(outputs.get("mode"), "propose");
    assert.equal(outputs.get("approval-status"), "draft");
    assert.equal(outputs.get("source-comment-url"), "");
    assert.equal(outputs.get("summary-json-path"), "artifacts/result=v1.json");
    assert.ok(text.includes("draft-count=1\n"));
    assert.ok(text.includes("summary-json-path=artifacts/result=v1.json\n"));
  });
});

for (const eol of ["\n", "\r\n"]) {
  for (const field of ["summary-json-path", "proposal-pull-request-url", "source-comment-url"]) {
    test(`${field} cannot inject output commands with ${JSON.stringify(eol)}`, async () => {
      await withOutput(async (path) => {
        const value = `review${eol}mode=gate${eol}gate-passed=true`;
        const input = { ...summary };
        if (field === "proposal-pull-request-url") input.proposalPullRequestUrl = value;
        if (field === "source-comment-url") input.sourceCommentUrl = value;
        await writeGitHubOutputs(path, input, field === "summary-json-path" ? value : undefined);
        const outputs = readOutputs(await readFile(path, "utf8"));
        assert.equal(outputs.get("mode"), "propose");
        assert.equal(outputs.has("gate-passed"), false);
        assert.equal(outputs.get(field), value);
      });
    });
  }
}

test("multiline values preserve blank lines and delimiter-like content", async () => {
  await withOutput(async (path) => {
    const value = "\nEOF\noutput<<EOF\nclarissimi_output_boundary\nvalue=a=b\n\n";
    await writeGitHubOutputs(path, summary, value);
    const outputs = readOutputs(await readFile(path, "utf8"));
    assert.equal(outputs.get("summary-json-path"), value);
    assert.equal(outputs.has("value"), false);
    assert.equal(outputs.has("output"), false);
  });
});

test("absent output destinations remain a no-op", async () => {
  await writeGitHubOutputs(undefined, summary, "summary.json");
  await writeGitHubOutputs("  ", summary, "summary.json");
});

test("trailing carriage returns survive native runner newline framing", async () => {
  await withOutput(async (path) => {
    for (const value of ["review\r", "\r", "review\r\n", "review\n\n"]) {
      await writeGitHubOutputs(path, summary, value);
      assert.equal(readOutputs(await readFile(path, "utf8")).get("summary-json-path"), value);
    }
  });
});

test("a delimiter collision is retried before writing any output", async (t) => {
  const uuids = ["collision", "safe-boundary"];
  const randomUUID = t.mock.method(crypto, "randomUUID", () => {
    assert.ok(uuids.length > 0, "Only the colliding delimiter should be retried");
    return uuids.shift();
  });
  syncBuiltinESMExports();
  try {
    await withOutput(async (path) => {
      const value = "review\nclarissimi_collision\nmode=gate";
      await writeGitHubOutputs(path, summary, value);
      const outputs = readOutputs(await readFile(path, "utf8"));
      assert.equal(outputs.get("summary-json-path"), value);
      assert.equal(outputs.get("mode"), "propose");
      assert.equal(randomUUID.mock.callCount(), 2);
    });
  } finally {
    randomUUID.mock.restore();
    syncBuiltinESMExports();
  }
});
