# Agent-Assisted Drafts

- Status: Draft

## Purpose

Use this guide when a maintainer asks an already-running AI coding agent, such as Codex, Claude
Code, Grok, or OpenCode, to inspect a pull request and produce a Clarissimi draft without giving
Clarissimi a provider API key.

The agent is responsible for reading the pull request evidence in conversation. Clarissimi is
responsible for validating the resulting JSON, enforcing approval status, and rendering public
recognition files.

## Assessment Template

For the current MVP, agent-authored drafts use `clarissimi.assessment/v1` and represent a merged
pull request source:

```json
{
  "schemaVersion": "clarissimi.assessment/v1",
  "contributor": {
    "platform": "github",
    "id": "123456",
    "login": "octocat",
    "profileUrl": "https://github.com/octocat"
  },
  "contributionType": "test",
  "affectedArea": "parser regression coverage",
  "impactLevel": "medium",
  "evidenceSummary": "Added a regression test for a parser crash triggered by nested input.",
  "evidenceRefs": [
    {
      "kind": "pull_request",
      "id": "PR-42",
      "url": "https://github.com/example/project/pull/42",
      "title": "Add parser regression coverage"
    }
  ],
  "suggestedBadge": "Regression Shield",
  "publicRecognitionText": "Added regression coverage that protects the parser from a nested-input crash.",
  "confidence": 0.82,
  "maintainerApprovalStatus": "draft",
  "source": {
    "repository": "example/project",
    "event": "merged_pull_request",
    "pullRequestNumber": 42,
    "mergedAt": "2026-07-08T00:00:00.000Z"
  }
}
```

## Field Notes

- `source.pullRequestNumber` stores the pull request number used for duplicate detection.
- `evidenceRefs[].url` stores the public PR, issue, review, commit, file, label, test, maintainer
  note, or advisory evidence URL when one exists.
- `impactLevel` is an internal recognition weight of `low`, `medium`, or `high`; it is not a public
  contributor score.
- `confidence` is provider or agent confidence from `0` to `1`; it is not averaged into a public
  contributor score.
- Public outputs must not include total score, average score, rank, leaderboard, or contributor tier
  fields.
- Raw evidence excerpts may be useful while drafting, but public ledger rendering strips
  `evidenceRefs[].excerpt`.

## Review Flow

Stage a draft for maintainer review:

```powershell
node packages/cli/dist/bin/clarissimi.js stage-draft --draft agent-draft.json --json
```

Approve the staged draft after review:

```powershell
node packages/cli/dist/bin/clarissimi.js approve-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --json
```

Import the approved draft into the canonical ledger and rebuild derived outputs:

```powershell
node packages/cli/dist/bin/clarissimi.js import-draft --draft .clarissimi/drafts/example-project-merged_pull_request-42.json --out-dir . --json
```

`import-draft` appends only approved or auto-approved records to `.clarissimi/contributions.jsonl`.
Derived files such as `.clarissimi/contributors.json`, `CONTRIBUTORS.md`, and static JSON are
rebuilt from the ledger.

## Delegated Model Envelope

If the current coding agent delegates drafting to another LLM, it may wrap the assessment in a local
envelope:

```json
{
  "schemaVersion": "clarissimi.draft-envelope/v1",
  "draftProvenance": {
    "agent": "local-agent",
    "delegatedModel": "example-model"
  },
  "assessment": {
    "schemaVersion": "clarissimi.assessment/v1",
    "contributor": {
      "platform": "github",
      "id": "123456",
      "login": "octocat",
      "profileUrl": "https://github.com/octocat"
    },
    "contributionType": "test",
    "affectedArea": "parser regression coverage",
    "impactLevel": "medium",
    "evidenceSummary": "Added a regression test for a parser crash triggered by nested input.",
    "evidenceRefs": [
      {
        "kind": "pull_request",
        "id": "PR-42",
        "url": "https://github.com/example/project/pull/42",
        "title": "Add parser regression coverage"
      }
    ],
    "suggestedBadge": "Regression Shield",
    "publicRecognitionText": "Added regression coverage that protects the parser from a nested-input crash.",
    "confidence": 0.82,
    "maintainerApprovalStatus": "draft",
    "source": {
      "repository": "example/project",
      "event": "merged_pull_request",
      "pullRequestNumber": 42,
      "mergedAt": "2026-07-08T00:00:00.000Z"
    }
  }
}
```

The envelope is accepted for interoperability, but Clarissimi records only the validated
`assessment` in public outputs. The public ledger does not store AI agent, model, prompt, token, or
provider provenance.
