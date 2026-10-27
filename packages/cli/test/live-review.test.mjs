import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkExternalDraftApproval } from "@clarissimi/core";

import { runCli } from "../dist/index.js";

const repoFlags = ["--repo", "sample/project", "--prs", "42,43"];

for (const jsonOutput of [true, false]) {
  for (const jsonBody of [true, false]) {
    test(`live CLI hides GitHub error bodies (${jsonOutput}:${jsonBody})`, async () => {
      await withTemp(async (cwd) => {
        const marker = "AUDIT_RESPONSE_MARKER";
        const message = marker.repeat(2_048);
        let stdout = "",
          stderr = "";
        const code = await runCli(
          [
            "recognize",
            "--pr",
            "https://github.com/sample/project/pull/42",
            ...(jsonOutput ? ["--json"] : []),
          ],
          {
            cwd,
            env: {},
            fetch: async () =>
              new Response(jsonBody ? JSON.stringify({ message }) : message, { status: 403 }),
            stdout: (text) => {
              stdout += text;
            },
            stderr: (text) => {
              stderr += text;
            },
          },
        );
        assert.notEqual(code, 0);
        assert.equal((stdout + stderr).includes(marker), false);
        assert.ok(stdout.length + stderr.length < 512);
        assert.deepEqual(await readdir(cwd), []);
      });
    });
  }
}

test("live recognition accepts a real PR URL and stays read-only by default", async () => {
  await withTemp(async (cwd) => {
    const api = githubApi();
    const result = await run(
      ["recognize", "--pr", "https://github.com/sample/project/pull/42"],
      cwd,
      api.fetch,
    );
    assert.equal(result.code, 0, result.stdout);
    assert.equal(result.value.fixtureKind, "live-github");
    assert.equal(result.value.results[0].assessment.maintainerApprovalStatus, "draft");
    assert.deepEqual(await readdir(cwd), []);
    assert.equal(api.requests.length, 4);
  });
});

test("selected real PRs stage, review, approve and publish in one batch", async () => {
  await withTemp(async (cwd) => {
    const staged = await stageBatch(cwd);
    assert.equal(staged.code, 0, staged.stdout);
    assert.equal(staged.value.stagedDraftPaths.length, 2);
    const review = await run(["review-drafts", "--review", "review.json"], cwd);
    assert.equal(review.code, 0, review.stdout);
    assert.equal(review.value.manifest.entries.length, 2);
    assert.equal(JSON.stringify(review.value).includes("patchExcerpt"), false);
    const approved = await approve(cwd);
    assert.equal(approved.code, 0, approved.stdout);
    assert.equal(approved.value.imported, 2);
    const ledger = await readFile(join(cwd, ".clarissimi/contributions.jsonl"), "utf8");
    assert.equal(ledger.trim().split("\n").length, 2);
    assert.ok((await readFile(join(cwd, "CONTRIBUTORS.md"), "utf8")).includes("octocat"));
    for (const path of staged.value.stagedDraftPaths) {
      assert.equal(checkExternalDraftApproval(JSON.parse(await readFile(path, "utf8"))), "valid");
    }
    const next = await run(
      ["recognize", "--repo", "sample/project", "--prs", "44", "--mode", "stage-draft"],
      cwd,
      githubApi().fetch,
    );
    assert.equal(next.code, 0, next.stdout);
    const nextReview = await run(["review-drafts", "--review", "next-review.json"], cwd);
    assert.equal(nextReview.code, 0, nextReview.stdout);
    assert.equal(nextReview.value.manifest.entries.length, 1);
  });
});

test("CLI surfaces other contributors as candidates and stages only the PR author's draft", async () => {
  await withTemp(async (cwd) => {
    const result = await run(
      ["recognize", "--pr", "https://github.com/sample/project/pull/42", "--mode", "stage-draft"],
      cwd,
      githubApi(1, true).fetch,
    );
    assert.equal(result.code, 0, result.stdout);
    const entry = result.value.results[0];
    assert.equal(entry.assessment.contributor.login, "octocat");
    assert.deepEqual(
      entry.contributorCandidates.map((candidate) => candidate.roles),
      [["reviewer"], ["issue_reporter"]],
    );
    assert.equal(result.value.stagedDraftPaths.length, 1);
    assert.equal((await readdir(join(cwd, ".clarissimi/drafts"))).length, 1);
    assert.equal(result.value.publicOutputsRendered, false);
  });
});

for (const input of [
  ["--pr", "https://github.com.example.test/sample/project/pull/42"],
  ["--pr", "https://github.com/sample/project/pull/42?extra=1"],
  ["--pr", "https://github.com/sample/project/pull/42", "--repo", "sample/project"],
  ["--repo", "sample/project", "--prs", "42,42"],
  ["--repo", "sample/project", "--prs", "42,,43"],
  ["--repo", "sample/project", "--prs", "9007199254740992"],
  ["--repo", "sample/project", "--prs", Array.from({ length: 26 }, (_, i) => i + 1).join(",")],
  [...repoFlags, "--fixture", "fixture.json"],
]) {
  test(`live input rejected before network: ${input.slice(0, 2).join(" ")} (${input.length}) ${input.at(-1)}`, async () => {
    await withTemp(async (cwd) => {
      const result = await run(["recognize", ...input], cwd, async () =>
        assert.fail("invalid input must not fetch"),
      );
      assert.equal(result.code, 1, result.stdout);
      assert.deepEqual(await readdir(cwd), []);
    });
  });
}

test("large PRs require explicit partial collection and expose omitted evidence", async () => {
  await withTemp(async (cwd) => {
    const strict = await run(
      ["recognize", "--repo", "sample/project", "--prs", "42"],
      cwd,
      githubApi(130).fetch,
    );
    assert.equal(strict.code, 4, strict.stdout);
    const partial = await run(
      ["recognize", "--repo", "sample/project", "--prs", "42", "--allow-partial"],
      cwd,
      githubApi(130).fetch,
    );
    assert.equal(partial.code, 0, partial.stdout);
    assert.equal(partial.value.results[0].collectionCoverage.changedFilesCollected, 100);
    assert.equal(partial.value.results[0].collectionCoverage.changedFilesOmittedAtLeast, 1);
    assert.deepEqual(await readdir(cwd), []);
  });
});

for (const target of ["draft", "manifest"]) {
  test(`batch approval rejects changed ${target} without approving the first draft`, async () => {
    await withTemp(async (cwd) => {
      const staged = await stageBatch(cwd);
      assert.equal((await run(["review-drafts", "--review", "review.json"], cwd)).code, 0);
      const path = target === "draft" ? staged.value.stagedDraftPaths[1] : join(cwd, "review.json");
      const value = JSON.parse(await readFile(path, "utf8"));
      const assessment = target === "draft" ? value : value.entries[1].assessment;
      assessment.publicRecognitionText = "Changed recognition after review.";
      for (const link of assessment.claimEvidenceLinks) {
        if (link.field === "publicRecognitionText") link.text = assessment.publicRecognitionText;
      }
      await writeFile(path, JSON.stringify(value));
      const result = await approve(cwd);
      assert.equal(result.code, 6, result.stdout);
      assert.ok(result.value.issueCodes.includes("approval_snapshot_mismatch"));
      assert.equal(
        JSON.parse(await readFile(staged.value.stagedDraftPaths[0], "utf8"))
          .maintainerApprovalStatus,
        "draft",
      );
      await assert.rejects(readFile(join(cwd, ".clarissimi/contributions.jsonl")), {
        code: "ENOENT",
      });
    });
  });
}

test("staging never overwrites an existing draft and reports already saved paths", async () => {
  await withTemp(async (cwd) => {
    const first = await run(
      ["recognize", "--repo", "sample/project", "--prs", "43", "--mode", "stage-draft"],
      cwd,
      githubApi().fetch,
    );
    const path = first.value.stagedDraftPaths[0];
    const original = await readFile(path, "utf8");
    const result = await stageBatch(cwd);
    assert.equal(result.code, 7, result.stdout);
    assert.equal(result.value.stagedDraftPaths.length, 1);
    assert.equal(await readFile(path, "utf8"), original);
  });
});

test("batch approval refuses output overlap with a reviewed draft", async () => {
  await withTemp(async (cwd) => {
    const staged = await stageBatch(cwd);
    await run(["review-drafts", "--review", "review.json"], cwd);
    const result = await run(
      [
        "review-drafts",
        "--review",
        "review.json",
        "--approve",
        "--ledger",
        staged.value.stagedDraftPaths[0],
      ],
      cwd,
    );
    assert.notEqual(result.code, 0);
    assert.equal(
      JSON.parse(await readFile(staged.value.stagedDraftPaths[0], "utf8")).maintainerApprovalStatus,
      "draft",
    );
  });
});

test("duplicate ledger identity rejects the entire reviewed batch", async () => {
  await withTemp(async (cwd) => {
    await stageBatch(cwd);
    await run(["review-drafts", "--review", "review.json"], cwd);
    assert.equal((await approve(cwd)).code, 0);
    const original = await readFile(join(cwd, ".clarissimi/contributions.jsonl"), "utf8");
    const manifest = JSON.parse(await readFile(join(cwd, "review.json"), "utf8"));
    for (const entry of manifest.entries)
      await writeFile(
        join(cwd, ".clarissimi/drafts", entry.filename),
        JSON.stringify(entry.assessment),
      );
    const result = await approve(cwd);
    assert.equal(result.code, 6, result.stdout);
    assert.equal(await readFile(join(cwd, ".clarissimi/contributions.jsonl"), "utf8"), original);
    assert.equal(
      JSON.parse(
        await readFile(join(cwd, ".clarissimi/drafts", manifest.entries[0].filename), "utf8"),
      ).maintainerApprovalStatus,
      "draft",
    );
  });
});

async function stageBatch(cwd) {
  return run(["recognize", ...repoFlags, "--mode", "stage-draft"], cwd, githubApi().fetch);
}

async function approve(cwd) {
  return run(["review-drafts", "--review", "review.json", "--approve", "--out-dir", "."], cwd);
}

async function run(argv, cwd, fetch = async () => assert.fail("review must stay offline")) {
  let stdout = "";
  let stderr = "";
  const code = await runCli([...argv, "--json"], {
    cwd,
    env: {},
    fetch,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr, value: JSON.parse(stdout) };
}

function githubApi(fileCount = 1, withCandidates = false) {
  const requests = [];
  return {
    requests,
    fetch: async (input, init) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://api.github.com");
      assert.equal(init.method, "GET");
      requests.push(url.href);
      let value;
      const match = /\/pulls\/(\d+)$/.exec(url.pathname);
      if (match)
        value = {
          number: Number(match[1]),
          title: "Update parser",
          body: withCandidates ? "Closes #7." : "Improve parser input handling.",
          html_url: `https://github.com/sample/project/pull/${match[1]}`,
          merged_at: "2026-07-08T00:00:00Z",
          user: { id: 123456, login: "octocat" },
          labels: [],
        };
      else if (url.pathname.endsWith("/files")) {
        const start =
          (Number(url.searchParams.get("page")) - 1) * Number(url.searchParams.get("per_page"));
        value = Array.from({ length: fileCount }, (_, index) => ({
          filename: `src/parser-${index}.ts`,
          status: "modified",
        })).slice(start, start + Number(url.searchParams.get("per_page")));
      } else if (url.pathname.endsWith("/comments")) value = [];
      else if (url.pathname.endsWith("/reviews"))
        value = withCandidates
          ? [{ id: 101, state: "APPROVED", user: { id: 2, login: "reviewer" } }]
          : [];
      else if (url.pathname.endsWith("/issues/7") && withCandidates)
        value = {
          number: 7,
          title: "Parser report",
          html_url: "https://github.com/sample/project/issues/7",
          user: { id: 3, login: "reporter" },
        };
      else assert.fail(`Unexpected API route: ${url.pathname}`);
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

async function withTemp(callback) {
  const path = await mkdtemp(join(tmpdir(), "clarissimi-live-review-"));
  try {
    await callback(path);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}
