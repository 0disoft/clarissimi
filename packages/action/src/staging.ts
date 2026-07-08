import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

import { canPublishAssessment } from "@clarissimi/core";
import {
  RENDERED_OUTPUT_PATHS,
  renderRecognitionOutputs,
  type RenderedRecognitionOutputs
} from "@clarissimi/renderers";
import type { ContributionAssessment, RecognitionSource, ValidationIssue } from "@clarissimi/schemas";

export interface ProposalOutputStagingInput {
  readonly outputDir: string;
  readonly assessments: readonly unknown[];
  readonly redactionMatchCount: number;
}

export interface ProposalOutputStagingResult {
  readonly outputDir: string;
  readonly manifest: ProposalOutputStagingManifest;
}

export interface ProposalOutputStagingManifest {
  readonly mode: "propose";
  readonly source: RecognitionSource;
  readonly assessmentCount: number;
  readonly approvalSummary: ProposalApprovalSummary;
  readonly redactionMatchCount: number;
  readonly files: readonly ProposalStagedFile[];
}

export interface ProposalApprovalSummary {
  readonly approved: number;
  readonly autoApproved: number;
}

export interface ProposalStagedFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export class ProposalOutputStagingError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = "ProposalOutputStagingError";
    this.issues = issues;
  }
}

export async function stageProposalRecognitionOutputs(
  input: ProposalOutputStagingInput
): Promise<ProposalOutputStagingResult> {
  const assessments = toPublishableAssessments(input.assessments);
  const source = requireSingleSource(assessments);
  const outputs = renderRecognitionOutputs(assessments);
  const files = await writeRenderedOutputs(input.outputDir, outputs);

  return {
    outputDir: input.outputDir,
    manifest: {
      mode: "propose",
      source,
      assessmentCount: assessments.length,
      approvalSummary: summarizeApprovals(assessments),
      redactionMatchCount: input.redactionMatchCount,
      files
    }
  };
}

function toPublishableAssessments(
  values: readonly unknown[]
): readonly ContributionAssessment[] {
  if (values.length === 0) {
    throw new ProposalOutputStagingError("Proposal output staging requires at least one assessment.", [
      {
        path: "$.assessments",
        code: "empty_array",
        message: "At least one approved or auto_approved assessment is required."
      }
    ]);
  }

  return values.map((value, index) => {
    const result = canPublishAssessment(value);
    if (!result.ok) {
      throw new ProposalOutputStagingError(
        "Proposal output staging accepts only valid approved assessments.",
        result.issues.map((issue) => ({
          ...issue,
          path: `$.assessments[${index}]${issue.path.slice(1)}`
        }))
      );
    }

    return result.value.assessment;
  });
}

function requireSingleSource(
  assessments: readonly ContributionAssessment[]
): RecognitionSource {
  const first = assessments[0];
  if (first === undefined) {
    throw new ProposalOutputStagingError("Proposal output staging requires a source event.", [
      {
        path: "$.assessments",
        code: "empty_array",
        message: "At least one assessment is required to derive source identity."
      }
    ]);
  }

  assessments.forEach((assessment, index) => {
    if (!sameSource(first.source, assessment.source)) {
      throw new ProposalOutputStagingError(
        "Proposal output staging supports one source event per staged manifest.",
        [
          {
            path: `$.assessments[${index}].source`,
            code: "mixed_source",
            message: "All staged assessments must come from the same recognition source."
          }
        ]
      );
    }
  });

  return first.source;
}

async function writeRenderedOutputs(
  outputDir: string,
  outputs: RenderedRecognitionOutputs
): Promise<readonly ProposalStagedFile[]> {
  const entries: readonly (readonly [keyof RenderedRecognitionOutputs, string])[] = [
    ["contributionsJsonl", RENDERED_OUTPUT_PATHS.contributionsJsonl],
    ["contributorsJson", RENDERED_OUTPUT_PATHS.contributorsJson],
    ["contributorsMarkdown", RENDERED_OUTPUT_PATHS.contributorsMarkdown],
    ["staticDataJson", RENDERED_OUTPUT_PATHS.staticDataJson]
  ];
  const files: ProposalStagedFile[] = [];

  for (const [key, path] of entries) {
    assertClarissimiOutputPath(path);
    const content = outputs[key];
    const destination = join(outputDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
    files.push({
      path,
      bytes: Buffer.byteLength(content, "utf8"),
      sha256: createHash("sha256").update(content, "utf8").digest("hex")
    });
  }

  return files;
}

function summarizeApprovals(
  assessments: readonly ContributionAssessment[]
): ProposalApprovalSummary {
  return assessments.reduce<ProposalApprovalSummary>(
    (summary, assessment) => ({
      approved: summary.approved + (assessment.maintainerApprovalStatus === "approved" ? 1 : 0),
      autoApproved: summary.autoApproved
        + (assessment.maintainerApprovalStatus === "auto_approved" ? 1 : 0)
    }),
    {
      approved: 0,
      autoApproved: 0
    }
  );
}

function sameSource(left: RecognitionSource, right: RecognitionSource): boolean {
  return (
    left.repository === right.repository
    && left.event === right.event
    && left.pullRequestNumber === right.pullRequestNumber
    && left.mergedAt === right.mergedAt
  );
}

function assertClarissimiOutputPath(path: string): void {
  const normalized = normalize(path);
  const allowed =
    normalized === "CONTRIBUTORS.md"
    || normalized.startsWith(`.clarissimi${sep}`)
    || normalized === ".clarissimi";

  if (
    isAbsolute(path)
    || normalized.startsWith("..")
    || normalized.includes(`${sep}..${sep}`)
    || !allowed
  ) {
    throw new ProposalOutputStagingError("Renderer output path is outside Clarissimi-owned files.", [
      {
        path: "$.files.path",
        code: "unsafe_output_path",
        message: "Staged output paths must stay within Clarissimi-owned recognition outputs."
      }
    ]);
  }
}
