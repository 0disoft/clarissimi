# ADR 0058: Add a Static Contributor Page

- Status: Accepted
- Date: 2026-08-09
- Owner: Repository maintainers

## Context

Clarissimi already derives contributor JSON, Markdown, and static JSON from the approved ledger,
but repository visitors must know where `CONTRIBUTORS.md` lives. A hosted service would add an
operations and privacy boundary that the MVP deliberately avoids. A repository-owned static page
can make the existing recognition record easier to discover without adding a server, database, or
public scoring model.

## Decision

The standalone CLI adds `clarissimi render-page --out-dir <path>`. It reads the selected approved
ledger, applies the existing automation-contributor display policy, and writes one deterministic
`index.html` file. The output directory is mandatory so the command cannot silently write into the
current checkout.

`packages/renderers` owns the pure HTML renderer. `packages/cli` owns ledger and config loading,
duplicate detection, explicit-path resolution, file writes, exit codes, and JSON command output.
The page uses the same contributor profiles and evidence-linked recognition summaries as the other
derived outputs.

The generated document contains its CSS inline, contains no JavaScript, and loads only GitHub avatar
images at view time. A restrictive content security policy allows those images and the inline style
while denying other network and executable content. Profile and evidence links retain the shared
HTTPS, URL-credential, and secret-bearing-parameter validation used by Markdown rendering.

Human, bot, and AI-agent contributors are included by default. Config
`includeAutomationContributors: false` or CLI `--exclude-automation-contributors` hides automation
only from the generated page and never changes the canonical ledger. Contributor order remains
deterministic and is not based on contribution count. The page exposes event counts and evidence,
not scores, percentages, ranks, or tiers.

GitHub Pages deployment remains consumer-owned. Clarissimi does not add a deployment workflow,
rewrite README files, fetch repository data, call a provider, or mutate the ledger in this command.
Custom themes, JavaScript applications, hosted dashboards, and cross-repository aggregation remain
outside this decision.

## Consequences

Repositories can publish a useful contributor view using existing static hosting without adopting
Clarissimi SaaS or a frontend framework. The single-file output is easy to review and replace, but
GitHub avatars still require network access when a visitor opens the page. Consumers choose whether
and how to publish the generated directory.

## Validation

- `pnpm run test`
- `pnpm run docs`
- `pnpm run release-readiness`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run smoke`
- `pnpm run check`
- `pnpm run contract`
