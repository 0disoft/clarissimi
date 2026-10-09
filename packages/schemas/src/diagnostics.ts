import type { ValidationIssue } from "./types.js";

// Only schema vocabulary can be carried from untrusted validation input to public diagnostics.
const FIELDS = new Set([
  "schemaVersion",
  "contributor",
  "platform",
  "id",
  "login",
  "profileUrl",
  "kind",
  "contributionType",
  "affectedArea",
  "impactLevel",
  "evidenceSummary",
  "evidenceRefs",
  "url",
  "title",
  "excerpt",
  "claimEvidenceLinks",
  "field",
  "text",
  "evidenceRefIndexes",
  "suggestedBadge",
  "publicRecognitionText",
  "confidence",
  "maintainerApprovalStatus",
  "approvalSnapshot",
  "contentSha256",
  "recordedAt",
  "source",
  "repository",
  "event",
  "pullRequestNumber",
  "mergedAt",
  "ledger",
  "assessments",
  "headSha",
  "decision",
  "reason",
]);

export function sanitizeValidationIssuePath(path: string): string {
  let result = "$";
  let rest = path.startsWith("$") ? path.slice(1) : "";
  while (rest.length > 0) {
    const index = /^\[(0|[1-9]\d{0,8})\]/.exec(rest);
    if (index !== null) {
      result += index[0];
      rest = rest.slice(index[0].length);
      continue;
    }
    const field = /^\.([A-Za-z][A-Za-z0-9]*)(?=\.|\[|$)/.exec(rest);
    if (field === null || !FIELDS.has(field[1]!)) return result;
    result += field[0];
    rest = rest.slice(field[0].length);
  }
  return result;
}

export function publicValidationDiagnostics(issues: readonly ValidationIssue[]): {
  readonly issueCodes: readonly string[];
  readonly issuePaths: readonly string[];
  readonly recoveryHint?: string;
} {
  const bounded = issues.slice(0, 8);
  const issueCodes = [
    ...new Set(
      bounded.map((issue) =>
        /^[a-z][a-z0-9_]{0,79}$/.test(issue.code) ? issue.code : "validation_failed",
      ),
    ),
  ];
  const issuePaths = [...new Set(bounded.map((issue) => sanitizeValidationIssuePath(issue.path)))];
  const recovery = issues.some((issue) =>
    ["approval_snapshot_required", "approval_snapshot_mismatch", "invalid_stage_status"].includes(
      issue.code,
    ),
  );
  return {
    issueCodes,
    issuePaths,
    ...(recovery
      ? {
          recoveryHint:
            "To approve edited text, set maintainerApprovalStatus back to draft, remove the old approvalSnapshot, review the content, and run clarissimi approve-draft again.",
        }
      : {}),
  };
}
