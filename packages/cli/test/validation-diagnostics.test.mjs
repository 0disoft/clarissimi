import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { validateContributionAssessment } from "../../schemas/dist/index.js";
import { OpenAiCompatibleProviderError } from "../../providers/dist/index.js";
import { writeGitHubProviderFailureStepSummary } from "../../action/dist/output.js";
import { writeFailure } from "../dist/output.js";
import { runCli } from "../dist/index.js";

test("validation diagnostics keep schema fields while dropping raw direct and nested property names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-diagnostics-"));
  try {
    for (const nested of [false, true]) {
      const assessment = JSON.parse(
        await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
      );
      const marker = "person@example.com_scoreShare";
      if (nested)
        assessment.claimEvidenceLinks = [
          {
            field: "evidenceSummary",
            text: assessment.evidenceSummary,
            evidenceRefIndexes: [0],
            [marker]: 1,
          },
        ];
      else assessment[marker] = 1;
      const validation = validateContributionAssessment(assessment);
      assert.equal(validation.ok, false);
      const error = new OpenAiCompatibleProviderError(
        "invalid_assessment",
        "Assessment rejected.",
        validation.issues,
      );
      for (const json of [false, true]) {
        let output = "";
        writeFailure(
          {
            stdout: (text) => {
              output += text;
            },
            stderr: (text) => {
              output += text;
            },
          },
          { flags: new Map(json ? [["json", true]] : []) },
          "recognize",
          error,
        );
        assert.ok(!output.includes("person@example.com"));
        assert.ok(!output.includes(marker));
        if (json && nested)
          assert.ok(JSON.parse(output).issuePaths.includes("$.claimEvidenceLinks[0]"));
      }
      const summary = join(dir, `summary-${nested}.md`);
      await writeGitHubProviderFailureStepSummary(summary, error);
      assert.ok(!(await readFile(summary, "utf8")).includes("person@example.com"));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("draft errors expose the editable field and the reapproval procedure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarissimi-draft-errors-"));
  try {
    const assessment = JSON.parse(
      await readFile(new URL("../../../fixtures/approved-draft.json", import.meta.url), "utf8"),
    );
    const path = join(dir, "draft.json");
    for (const json of [false, true]) {
      assessment.affectedArea = "";
      await writeFile(path, JSON.stringify(assessment));
      let output = "";
      const io = {
        cwd: dir,
        stdout: (text) => {
          output += text;
        },
        stderr: (text) => {
          output += text;
        },
      };
      assert.equal(
        await runCli(["stage-draft", "--draft", path, ...(json ? ["--json"] : [])], io),
        6,
      );
      assert.ok(output.includes("$.affectedArea"));
      assessment.affectedArea = "parser";
      await writeFile(path, JSON.stringify(assessment));
      output = "";
      assert.equal(
        await runCli(["approve-draft", "--draft", path, ...(json ? ["--json"] : [])], io),
        6,
      );
      assert.ok(output.includes("approvalSnapshot"));
      assert.ok(output.includes("approve-draft again"));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
