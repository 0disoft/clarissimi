# Validation

## 2026-10-27 Stable 1.1.0 release preparation

Action `v1.1.0` and standalone CLI `clarissimi@1.1.0` collect the additive live-PR,
batch-review, contributor-candidate, redaction, publication-integrity, and output-isolation
changes since 1.0.1. Current installation guides, distribution metadata, release contracts,
contract fixtures, ADR 0062, and release notes name the new compatible minor candidate.
Private workspace packages and persisted schema versions remain unchanged.

Build/typecheck, isolated standalone package installation and stage/approve/import/rebuild,
lint, formatting, documentation, migration compatibility, CLI smoke, bundle freshness,
static release-readiness, secret scan, and whitespace checks passed. The full suite passed
1,124 of 1,128 tests with zero failures; four POSIX permission tests were skipped on Windows.
Hosted exact-SHA evidence, immutable release publication, moving-alias promotion, and staged
npm approval are recorded separately after their actual completion.

## 2026-10-27 GitHub Action output command isolation

The Action interpolated summary paths and API metadata directly into `name=value` commands.
Six deterministic cases (three fields with LF and CRLF) changed the parsed `mode` output from
`propose` to `gate` and introduced `gate-passed=true`. A seventh pre-fix regression rejected
delimiter-like content as an invalid output file. These are local serializer reproductions using
the documented runner parsing rules; no live GitHub metadata manipulation or permission bypass
was attempted. Summary-path influence requires control of the input, and URL influence requires
control of API metadata or a supplied client.

The writer now separates fixed output names from values and serializes every mode through one
encoder. Single-line commands remain byte-compatible. CR/LF values use UUID-delimited multiline
commands; the encoder retries delimiter collisions before the existing single append operation.
Native newline framing preserves trailing CR, LF, blank lines, equals signs, and delimiter-like
content without allowing extra commands. All six injection cases now preserve the original mode,
contain no extra gate output, and round-trip the complete value. No network I/O is added; the
writer still performs one file append. For B value characters and k delimiter attempts, scanning
is O(kB), normally O(B) with one attempt, and output storage remains O(B).

ADR 0030 records the serialization boundary, and the checked-in Action bundle is regenerated.
API signatures, output names and values, schemas, DB, dependencies, runner configuration, and
repository-hygiene policy are unchanged. Only multiline command encoding changes. Hosted CI and
live runner execution were skipped because this slice is local; cross-platform behavior follows
the runner source but was executed on Windows only. No push, publication, or deployment was run.

- Build/typecheck and all 11 focused output tests passed, including six injection cases,
  existing single-line/append behavior, missing destinations, multiline content, trailing CR,
  and forced delimiter collision/retry.
- The full suite with `--test-concurrency=4` passed 1,124 of 1,128 tests with zero failures;
  four existing POSIX permission cases were skipped on Windows.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, Action bundle freshness, secret scan,
  static release-readiness gates, and Git whitespace checks passed.

## 2026-10-27 GitHub HTTP error response privacy

Both GitHub clients copied upstream JSON `message` fields into public errors. The read-only
client also wrapped non-JSON error text as a message, allowing the default 2 MiB response budget
to flow into CLI diagnostics. With harmless response markers, the original read client exposed
all 12 JSON/plain-text cases; the Action client exposed nine of 15 cases, including repository
settings and rate-limit responses. Six initial regressions failed before implementation. No
real credential or external API request was used.

Both mappers now return application-owned category/status messages instead of upstream text.
Response text is used only internally for existing rate-limit and repository-setting detection.
All 27 client cases now keep the marker out of error stacks and serialized fields while preserving
codes, retryability, status, and Retry-After metadata. Messages are at most 160 characters for real
HTTP status codes. CLI text/JSON tests with 42 KiB response messages produce fewer than 512 output
characters and no marker; Action environment tests also confirm no marker in stderr and no output
or summary file on failure. Request limits, retry counts, create reconciliation, and cleanup are
unchanged; no extra Git subprocess, network request, or redaction pass is added.

ADR 0040, ADR 0046, and the observability contract record the privacy boundary; the Action bundle
is refreshed. Public API signatures, error-code vocabulary, schemas, DB, dependencies, runner,
and repository-hygiene policy are unchanged. Public error wording intentionally no longer
includes upstream diagnostic text. Hosted CI, external provider calls, external push, release,
and deployment were not run.

- Build/typecheck passed. The targeted GitHub clients/live CLI suite passed 56 tests, and Action
  JSON/log privacy passed seven tests. Eight new tests cover 27 response/classification cases,
  four CLI output/body combinations, and two Action log/body combinations.
- The full suite with `--test-concurrency=4` passed 1,113 of 1,117 tests, with four POSIX permission
  cases skipped on Windows and zero failures.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates,
  regenerated Action bundle freshness, secret scan, and Git whitespace checks passed.

## 2026-10-27 Unpublished commit history ownership

The shared ownership reader inspected only the final tree difference. A post-commit hook could
add a file in one commit and delete it in another, leaving the final manifest and owned-path diff
unchanged while publishing the file's content in Git history. The original direct-commit regression
published two history entries for a harmless temporary marker file to a local bare remote.
Four additional regressions showed recognition and stage-draft proposal reuse publishing both
linear and merge-only unowned README changes despite identical final trees. All five regressions
failed before the fix and passed afterward; direct-mode published marker history entries drop
from two to zero, and all four unsafe proposal reuses are rejected before publication.

The shared reader now inspects every commit in `base..capturedCommit` using one NUL-delimited
`git log --format= --root --diff-merges=separate --no-renames --name-only -z` request. Merge changes
are compared against every parent. Root changes and literal filenames remain visible; paths are
deduplicated and sorted. This replaces one diff subprocess with one history subprocess and adds
zero Git subprocesses or network calls. Inspection covers intermediate changes rather than only
net changes, so processing scales with unpublished history. The existing captured-SHA, content
hash, path ownership, remote-base, and publication checks remain in place.

ADR 0017 and ADR 0038 record the stronger ownership boundary; the Action bundle is regenerated.
Public API signatures, schemas, DB, dependencies, runner, and repository-hygiene policy are
unchanged. Previously accepted history with reverted unowned paths now fails using existing
ownership diagnostics. Multi-commit histories touching only manifest-owned paths remain reusable
when the final staged content matches. Rejected direct commits and proposal branches remain local
for inspection. No real credentials were used. Hosted CI, external provider requests, external
push, release, and deployment were not performed.

- Build/typecheck passed. The complete suite with `--test-concurrency=4` passed 1,105 of 1,109 tests,
  with four POSIX permission tests skipped on Windows and zero failures. Six new cases cover the
  five unsafe histories and valid owned-only history reuse with unique deterministic paths.
- Existing immutable-snapshot race tests, rename/leading-space path checks, output-blob integrity,
  SHA-256 direct publication, and remote-base checks remain passing.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates,
  Action bundle freshness, secret scan, and Git whitespace checks passed.

## 2026-10-27 Direct publication base boundary

The direct publisher checked HEAD against the generated commit but did not compare its captured
base with the actual remote target. A deterministic regression committed an unpublished README
change on a feature branch, created a recognition commit with matching expected HEAD, and published
to a temporary bare remote's main branch. The original implementation accepted it: the generated
commit's owned-path diff omitted README, yet remote README became the unpublished feature content.
The regression failed before the fix and passed afterward; the unrelated published file count in
that reproduction drops from one to zero. No hosted writes or external provider calls were used.

For new commits, the publisher now reads the exact target ref once with `git ls-remote --refs`
against the configured remote and requires its SHA to equal `baseCommitSha`. An absent target or
mismatch raises `remote_base_mismatch` before push and preserves the local commit. This adds one
Git subprocess and one remote lookup, independent of ancestor count; it does not scan history.
An unchanged rebuild performs no remote lookup or push. The existing captured-SHA push and normal
fast-forward semantics remain in place: a deterministic update after the lookup is still rejected
by Git. The preflight is not a remote transaction lock.

ADR 0038 and the product spec record this existing-target requirement. Public API signatures,
schemas, DB, dependencies, runner, and repository-hygiene policy are unchanged; the publisher adds
the diagnostic above for remote base mismatches instead of accepting unpublished ancestors or
creating absent target branches. The generated Action bundle is refreshed. Hosted CI, live
provider verification, push, release, and deployment were not run.

- Build/typecheck and all 21 focused direct-commit tests passed. Five new cases cover unpublished
  ancestors, custom remotes, absent targets, a remote update after preflight, and unchanged-output
  offline no-op; existing SHA-256 and verified-commit publication cases remain passing.
- The full suite with `--test-concurrency=4` passed 1,099 of 1,103 tests, with four POSIX permission
  cases skipped on Windows and zero failures.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates, Action
  bundle freshness, secret scan, and Git whitespace checks passed.

## 2026-10-27 Scheme-independent authorization redaction

The authorization rule recognized only Basic, Bearer, and Negotiate. Extension schemes and
comma-separated authentication parameters could leave credential values in prepared evidence.
Comparing the original HEAD implementation with the fix on eight representative headers found
the harmless marker retained in five original outputs and zero updated outputs. New 64-form
extension-scheme and parameter-list regressions also failed before implementation. No real
credentials, external provider calls, or hosted writes were used.

The shared rule now recognizes HTTP scheme tokens and consumes token credentials or complete
parameter lists, including escaped quotes, quoted commas, optional whitespace, empty list members,
and slash-separated AWS scope components. Quoted whole values and quoted individual credentials
share the existing escape grammar. The rule order, general eight-character threshold, report
vocabulary, and report-value privacy remain unchanged. No dependency, Git subprocess, network call,
public API signature/schema, DB, runner, or repository-hygiene policy was added or changed.

ADR 0010 records the expanded masking boundary and RFC 9110 grammar. The Action bundle is refreshed.
Matching is conservative same-line text detection, not credential validity checking; unrelated
following lines and fields remain available. Hosted CI and external publication/deployment were
not run.

- Build/typecheck and the 95 focused redaction/core/provider tests passed. The complete suite with
  `--test-concurrency=4` passed 1,094 of 1,098 tests, with four POSIX permission cases skipped on
  Windows and zero failures. Existing 96 known-scheme forms remain compatible; 64 extension forms,
  parameter lists, field boundaries, short values, and quoted credentials are covered.
- Provider-preparation and repository-visible checks cover eight representative header values;
  an injected provider captures the request and confirms no marker survives in evidence or refs.
  A child-process deadline test covers five long inputs, including 128 KiB tokens/whitespace,
  16,384 parameters, repeated empty list members, and unterminated escaped quoted values.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates,
  regenerated Action bundle freshness, secret scan, and Git whitespace checks passed. An unnecessary
  quote escape in a test fixture was corrected after the initial lint warning.

## 2026-10-27 Immutable proposal ownership snapshot

Existing-proposal reuse checked changed paths through a branch name and resolved the branch SHA
again afterward. Two regressions moved that ref immediately after the ownership diff completed.
Both original paths (recognition and stage-draft) accepted and published a descendant commit with
an unrelated README change to temporary local bare remotes. The output hashes and base ancestry
still matched, so those checks did not detect the substituted commit. No hosted writes occurred.

The writer now captures the proposal SHA once and uses it for the ownership diff, output checks,
base checks, and returned metadata. New-proposal ownership checks also use the captured commit SHA.
The publisher's existing branch-mismatch guard rejects the concurrently moved local ref, preserving
the unowned local commit for inspection without publishing it. Ownership preflight drops from three
Git subprocesses to two; membership validation remains O(M + C) for M manifest files and C changed
paths, with no extra network request or checkout lock. The two deterministic regressions use real
refs and a process-completion interposition, restored in `finally`, without timing sleeps.

ADR 0017 records this snapshot boundary; the generated Action bundle is refreshed. Public API
signatures, schemas, DB, dependencies, runner, and repository-hygiene policy are unchanged. Concurrent
checkout/staging writes during generation still require external coordination. Hosted CI and external
publication/deployment were not run.

- Both focused race regressions failed before the implementation change and passed afterward.
  Build/typecheck passed. The complete suite with `--test-concurrency=4` passed 1,090 of 1,094 tests,
  with four POSIX permission tests skipped on Windows and zero failures. The cases confirm the
  rejected branch remains local, the remote proposal stays absent, and remote main is unchanged.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates,
  regenerated Action bundle freshness, secret scan, and Git whitespace checks passed.

## 2026-10-27 Pin publication to verified commits

Both publishers checked a local commit SHA but pushed a mutable ref (`HEAD` or the proposal
branch name). Two deterministic regressions against the original implementation moved that ref
immediately before Git push resolved it. In both cases a descendant commit removing all generated
recognition outputs reached a temporary local bare remote, while the publisher returned the older
verified SHA. No hosted repository or external provider was used.

Both push refspecs now use the full SHA captured by the existing preflight. Moving a local ref
after validation can no longer replace the published commit. Proposal empty-ref leases and
equivalent-winner reconciliation, direct fast-forward semantics, initial mismatch rejection, and
unchanged-output behavior are preserved. Selecting the source is O(1), adds no Git subprocess or
network request, and needs no checkout lock. The two tests mutate actual local refs and verify the
bare remote's resulting SHA; direct mode interposes only process launch, restoring the Node built-in
binding in `finally`, without sleep-based race timing.

ADRs 0017 and 0038 record the immutable publication source. Public API signatures, schemas, DB,
dependencies, runner, and repository-hygiene policy are unchanged. The Action bundle is refreshed.
This protects source selection during publication; concurrent remote updates after the push and
concurrent checkout writes during generation still require normal Git/workspace coordination.
Hosted CI and external publishing/deployment are outside this local run.

- Build/typecheck passed. The focused direct/proposal publisher suite passed 26/26 tests. The
  complete suite with `--test-concurrency=4` passed 1,088 of 1,092 tests, with four POSIX permission
  tests skipped on Windows and zero failures. Both ref-substitution regressions failed against
  the original code and passed after the fix; SHA-256 direct publication remains covered.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, and release-readiness static
  gates passed. The first freshness check found the not-yet-regenerated Action bundle; after
  regeneration the full static readiness gate, including bundle freshness and secret scan, passed.

## 2026-10-27 Committed output content verification

Path ownership checks did not prevent hooks from replacing approved bytes inside permitted
outputs. Four pre-commit hook regressions failed against the original implementation: direct and
proposal mode both accepted an eight-byte `approved` to `rejected` rewrite and an appended invalid
ledger record. The two direct cases advanced local bare target branches. No hosted writes or
external model calls were made.

Both writers now verify committed regular-file blobs against staged content and the SHA-256
manifest before returning a publishable result. A single literal-path `ls-tree -r -z` reads all
output object IDs; SHA-1/SHA-256 Git blob IDs are computed from revalidated staged bytes. No
committed blob body is decoded or buffered. Validation takes O(B + M) local work for B staged
bytes and M outputs, one Git subprocess, and M staged file reads. A direct mismatch preserves
the local commit and specific `committed_output_mismatch` diagnostic. Proposal creation/reuse
shares the verifier and retains its existing recovery boundary. ADRs 0017 and 0038 record this.

Public function signatures, schemas, DB, dependencies, runner, and repository-hygiene policy are
unchanged. The Action bundle is refreshed. Hooks and clean filters that alter generated bytes now
fail closed. This verifies the captured commit; process crashes and concurrent checkout/staging
mutation still require external coordination. Hosted CI and external publishing/deployment are
outside this local run.

- Build/typecheck and the initial 30 direct/proposal writer tests passed. The final complete
  suite with `--test-concurrency=4` passed 1,086 of 1,090 tests, with four POSIX permission cases
  skipped on Windows and zero failures. A real SHA-256-format repository and local bare remote
  verified successful creation/publication with 64-character object IDs; normal SHA-1 cases pass.
- Same-size tampering explicitly retains the staged byte count while replacing the approval
  status; both direct corruption cases retain the rejected local commit and unchanged target.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static
  gates, and regenerated Action bundle freshness passed.

## 2026-10-27 Direct commit publication path boundary

The direct writer listed changed paths after commit hooks but returned a publishable result
without checking the manifest. Three real pre-commit hook cases on the original implementation
published unrelated tracked edits, new files, and a rename from README into CONTRIBUTORS to local
bare target branches. All three violated the unchanged-target assertion. No hosted GitHub writes
were made. A fourth case exposed leading-whitespace filename normalization in the first guard
iteration; preserving raw NUL-delimited output prevents that normalization bypass.

Direct and proposal writers now share exact manifest membership validation and raw Git diff
parsing with `--no-renames --name-only -z`. Both sides of renames are checked and filenames are
not quoted or trimmed. Direct mode rejects extra paths with `unowned_commit_changes`, preserves
the local commit for inspection, and returns no publishable result. Validation costs O(M + C)
time and O(M) membership storage for M manifest paths and C changed paths. Existing diff calls
are reused with no additional Git subprocess, network request, or dependency.

ADR 0038 records the post-hook ownership boundary and diagnostic. Public function signatures and
schemas, DB, dependency, runner, and repository-hygiene policy are unchanged. The generated Action
bundle is refreshed. Hosted CI and external publication/deployment are outside this local run.
The check constrains paths; validating hook edits within already permitted files and coordinating
concurrent checkout changes remain outside this change.

- Build/typecheck passed. The initial direct/proposal writer suite passed 25 tests; after the
  filename-parsing hardening, all four focused publication regressions passed. The final complete
  suite with `--test-concurrency=4` passed 1,081 of 1,085 tests, with four POSIX permission cases
  skipped on Windows and zero failures.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates,
  and regenerated Action bundle freshness passed. No new workflow run or external provider call
  was triggered.

## 2026-10-27 Scoped direct-commit failure recovery

The direct writer used `git reset --hard` on local commit failure, despite initially checking for
a clean checkout. Two real Git hook regressions failed on the original HEAD: a rejecting hook's
tracked/staged README change was erased, and a hook-created commit was rewound to the old HEAD.
The fixtures use temporary repositories and local bare remotes, with no hosted GitHub writes.

Direct and proposal writers now share internal manifest ownership validation and literal-path
restoration. Direct recovery restores only validated manifest paths, preserves unrelated work and
index entries, and never resets HEAD. If HEAD changed it reports `rollback_failed` and preserves
the checkout for inspection. An additional regression covers restoration of already tracked
recognition output after a later staged-file hash failure. ADR 0038 records recovery boundaries.

No public API signature/schema, DB, dependency, runner, or repository-hygiene policy change.
The generated Action bundle is refreshed. Hosted CI, external publication/deployment, and process
crashes are outside this run. Concurrent changes to owned outputs and branch switches still
require external checkout coordination; this patch does not add repository-wide transaction locks.

- Build/typecheck passed. The focused direct/proposal writer suite passed 22 tests; the final
  complete suite with `--test-concurrency=4` passed 1,077 of 1,081 tests with four POSIX permission
  cases skipped on Windows and zero failures. The stronger final hook case checks distinct staged
  and unstaged README bytes plus unrelated untracked content.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, release-readiness static gates,
  and Action bundle freshness passed. Failure reproductions ran before the implementation rebuild;
  both the erased README and the rewound HEAD were observed against the original implementation.

## 2026-10-27 URL authority credential masking

URL userinfo in connection strings bypassed assignment and email detection, leaving credential
content in provider evidence and accepting credential-bearing structural URLs. A comparison with
the original HEAD retained an explicit non-credential marker in 84/84 combinations of seven
schemes, four userinfo forms, and three hosts; the same cases now retain it in 0/84. Four common
schemes also reproduce the original failure independently. No credentials were created or used.

The shared redactor now scans maximal scheme tokens and each authority once before other text
rules. Nonempty userinfo before the last authority `@` is masked without interpreting credentials;
scheme, host, port, path, query, and fragment are preserved. The scan is O(n), including failed
scheme candidates, rather than retrying an unbounded scheme regex from every character. Existing
report kinds and positional metadata are preserved. ADR 0010 records the detector and boundaries.

All 208 focused redaction/core/provider tests passed. Five added regressions cover the 84 forms,
offsets, multiple authorities, quoted/nested JSON, preservation of non-userinfo `@`, structural
field rejection, public-text checks, and a captured provider request body. A child process with a
five-second deadline covers long scheme/userinfo tokens and repeated URL prefixes up to 262,144
characters. Whole-URL encoding and secrets carried in paths or queries are outside the new rule.

No public API/schema, DB, dependency, runner, or repository-hygiene policy change. The generated
Action runtime is refreshed. Hosted CI, live model calls, publishing, and deployment are outside
this local security change.

- Build/typecheck and the final complete suite with `--test-concurrency=4`: 1,078 tests,
  1,074 passed, four POSIX permission tests skipped on Windows, zero failures. The initial
  `pnpm run check` had one PowerShell completion child-process timeout under default concurrency;
  it is recorded as a failure, and that case passed in the complete bounded-concurrency rerun.
- Lint, formatting, documentation (160 Markdown files), CLI smoke, and release-readiness static
  gates passed. The Action bundle was regenerated and its freshness check passed.
- Boundary regressions also cover punctuation-adjacent URLs and raw apostrophes in userinfo.

## 2026-10-27 Complete cookie field masking

The whitespace-delimited generic rule masked only the first unquoted cookie component or skipped
a short/quoted first component, leaving later session data in provider evidence. Four reproduced
header forms retained an explicit non-credential marker. Cookie/Set-Cookie fields now run through
an opaque-value rule before token and generic rules. Quoted values reuse the escape-aware grammar;
unquoted values consume the rest of the same line, including inline explanations, while following
lines remain intact. Explicit cookie fields also mask short values. ADR 0010 records this policy.

A same-input comparison with the original HEAD covered 48 combinations of four field spellings,
two separators, three cookie-list shapes, and bare/whole-header-quoted forms. Retained session
markers decreased from 48/48 to 0/48. Five regressions cover those forms and occurrence offsets,
quoted JSON boundaries, short values and unrelated fields, a child-process deadline for 65,536
cookie components, provider preparation/public text rejection, and a captured provider request.
All 203 focused redaction/core/provider tests passed. Only explicit non-credential markers were
used; no credentials were generated and no external model requests were made.

No public API/schema, DB, dependency, or CI runner changes are introduced. The generated Action
runtime is refreshed for the shared redaction rule. Hosted CI, live models, publishing, and
deployment are outside this local security change.

- `pnpm run check`: 1,073 tests, 1,069 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Escape-aware quoted assignment redaction

Quoted JSON, dotenv, and authorization values previously ended at escaped delimiters, leaving the
remaining value in prepared provider evidence despite a positive redaction report. All three
reproduced paths retained a non-credential suffix marker. Their shared quote grammar now consumes
escapes as character pairs, distinguishes escaped delimiters from closing quotes, and masks
unterminated values to the end of the same line. The generic eight-character threshold is applied
to captured raw content; occurrence offsets remain correct with positional captures. ADR 0010
records the quote grammar, truncated-value policy, and threshold/report behavior.

A same-input comparison with the original HEAD implementation covered 72 combinations of three
assignment contexts, two quote types, six escape/parity patterns, and complete/truncated forms.
Retained suffix markers decreased from 48/72 to 0/72. Five new regressions cover those combinations
and exact report offsets, 7/8-character boundaries including escaped content, a child-process
deadline for 131,072 backslashes, provider preparation, and a captured provider request. The prior
whitespace deadline guard now expects conservative masking of the truncated quoted value. All
198 focused redaction/core/provider tests passed. No credentials were generated or external model
calls made; only explicit non-credential markers were used.

No public API/schema, DB, dependency, or CI runner changes are introduced. The generated Action
runtime is refreshed to include the shared redaction implementation. Hosted CI, live models,
publishing, and deployment are outside this local security change.

- `pnpm run check`: 1,068 tests, 1,064 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Complete authorization credential masking

The generic assignment matcher treated the first whitespace-delimited word as the entire value.
Consequently, plain Basic/Bearer headers were not masked (their scheme names are under eight
characters), while Negotiate lost only its scheme and retained its credential. All three reproduced
forms retained a non-credential marker in prepared provider evidence. A same-line scheme-aware
Authorization/Proxy-Authorization rule now runs before generic/token rules and masks the credential
with its scheme. ADR 0010 records this boundary; general value thresholds and report kinds remain
unchanged.

Comparing original HEAD redaction with the new code on the same 96 inputs (three schemes, four
header spellings, two assignment separators, four quote forms) reduced retained markers from
72/96 to 0/96. Six added regressions cover those forms and exact occurrence offsets, short and
truncated values, quoted-value preservation, unrelated fields and following lines, a child-process
deadline for 131,072-space unterminated values, core preparation/repository-visible rejection,
and the actual request body captured by an injected provider. All 193 redaction/core/provider
tests passed. Tests use only an explicit non-credential marker and make no external model calls.

No public API/schema, DB, dependency, or CI runner changes are introduced. The generated Action
runtime is refreshed to include the shared redaction rule. Hosted CI, live models, publishing,
and deployment are outside this local security change.

- `pnpm run check`: 1,063 tests, 1,059 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Indexed claim-to-evidence range lookup

Provider validation previously visited every field link for each claim-rule match and filtered
every field link again for each numeric sentence. Both paths now share a binary search over the
ordered, non-overlapping ranges guaranteed by schema-validated field coverage. ADR 0061 records
the lookup boundary. All overlapping segments, original issue indexes, strict endpoint comparisons,
and evidence support checks are preserved. Range lookup drops from O(C * L) to O(C log L + K),
where C is claim count, L is link count, and K is total overlaps visited; prose parsing and evidence
comparison costs are separate.

A synthetic assessment with 8,000 `"Latency is 5 ms."` sentences and one link per sentence in each
public field, all pointing to one `"Measured latency is 5 ms."` excerpt, occupies 1,584,577 UTF-8
bytes. The original HEAD validator and the updated validator ran in the same process with one
warm-up and three samples each. Before: 2548.91/3082.72/2039.80 ms; after: 291.16/227.35/247.12 ms.
Medians decreased from 2548.91 to 247.12 ms, about 10.3 times faster for this local fixture, not a
production latency guarantee. Three focused regressions compare lookup against the previous
linear predicate across boundaries, gaps, spanning queries, and uneven lengths, and cap endpoint
probes to logarithmic growth for 16,384 links. All 144 focused provider tests passed.
For a single overlap near the end of those 16,384 links, counted endpoint property reads decrease
from 32,767 for the original linear predicate to 16 for binary lookup.

No public API/schema, DB, dependency, repository layout policy, or CI runner changes are introduced.
The generated Action runtime is refreshed for the shared provider change. Hosted CI, live model
calls, publishing, and deployment are outside this local performance change.

- `pnpm run check`: 1,057 tests, 1,053 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Reuse numeric measurement parsing

Provider result validation previously reread and reparsed the same evidence body for every numeric
claim in both public fields. A per-validation, per-evidence checker now lazily parses measurement
sentences and reuses them. Sentence-local matching and the metadata/content boundary are preserved;
no cache survives a validation. ADR 0061 records the cache lifetime and matching boundary.

A local synthetic comparison against the original HEAD implementation used one 160,026-character
excerpt (`"Unrelated text. "` repeated 10,000 times followed by `"Measured latency is 5 ms. "`)
and 200 identical `"Latency is 5 ms."` claims in each public field. After one warm-up per version,
three samples measured 816.83/797.81/848.91 ms before and 9.37/9.93/8.83 ms after: medians
816.83 and 9.37 ms (about 87 times faster for this fixture). A counting getter verified 400 body
reads before and one after per validation. Evidence-body scans drop from O(claims * body length)
to O(body length); numeric-value comparison costs remain. This is a local synthetic result, not a
production latency guarantee. Five regressions cover matching/nonmatching/empty body reuse,
resumed parsing without cross-sentence support, and evidence changes between validations.

No public API/schema, DB, dependency, or runner changes are introduced. The generated Action runtime
is refreshed to include the shared provider change. Hosted CI, live model calls, publishing, and
deployment are outside this local performance change.

- `pnpm run check`: 1,054 tests, 1,050 passed, four POSIX permission tests skipped on Windows,
  zero failures. The focused provider suite passed all 141 tests.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.

## 2026-10-27 Private-key armor format coverage

Encrypted PKCS #8 and OpenPGP private-key armor previously passed through redaction in both complete
and incomplete form; all four reproduced cases retained the non-key test payload in prepared
provider evidence. Both boundary patterns now share a label vocabulary covering the two omitted
formats. ADR 0010 records the standard labels and scope. Eight new tests cover complete/incomplete
blocks, mixed formats, public-key/certificate preservation, provider preparation, excerpt truncation,
and repository-visible rejection. All 46 focused redaction/core/collector tests passed. The existing
16,384-header child-process deadline guard also covers both new formats. Tests use only non-key
content; no credentials or cryptographic key material were generated. API shapes, DB, and runners
are unchanged.

- `pnpm run check`: 1,049 tests, 1,045 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action bundle regenerated and its freshness check passed.
- Hosted CI, live model calls, publishing, and deployment were not run for this local fix.

## 2026-10-26 Bounded assessment nesting

The recursive public-score inspection previously threw `RangeError` for 6,000-level JSON, including
a model-produced malformed `affectedArea` under 13 KiB. Assessment validation now stops at the first
value deeper than 64 levels below the root and returns `assessment_nesting_limit`; the external
provider maps this to its existing typed `invalid_assessment` error. ADR 0009 records the limit.
Five added regressions cover deep arrays/objects, the 64/65 boundary, score rejection within the
limit, and the provider response path. All 164 schema/provider tests passed. No dependency,
database, or runner changes are introduced; the new depth bound is an input-validation constraint.

- `pnpm run check`: 1,041 tests, 1,037 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- Lint, formatting, CLI smoke, documentation validation, and release-readiness static gates: passed.
- Action runtime regenerated and its bundle freshness check passed.
- Hosted CI, live model calls, publication, and deployment were not run for this local fix.

## 2026-10-26 Measurement content excludes evidence metadata

Numeric support now reads only `excerpt` and `text`; titles and filenames still identify candidates
but cannot supply measurement context or values. Before the fix, eight unsupported cases passed,
including a filename produced by the real GitHub collector, and two supported body-content cases
were rejected because titles contaminated the comparison. All eleven added boundary cases and the
41 existing numeric cases now pass. ADR 0061 records the content/metadata boundary. No additional
filesystem or network calls, public schema changes, or runner changes are introduced.

- `pnpm run check`: 1,036 tests, 1,032 passed, four POSIX permission tests skipped on Windows,
  zero failures. All 52 numeric performance tests passed.
- Lint, formatting, and CLI smoke validation: passed.
- Action bundle regenerated and freshness verified; release-readiness static gates: passed.
- Hosted CI, external model calls, publication, and deployment were not run for this local fix.

## 2026-10-26 Numeric measurement change direction

Seventeen newly added counterexamples reproduced false acceptance of reversed, negated, ambiguous,
or absolute-versus-change numeric performance support before the fix. The numeric regression suite
now covers these cases, valid English/Korean changes, separate metric clauses, and an unbound value
after a conjunction. The provider boundary compares change direction in addition to metric, value,
and unit, without extra network or filesystem calls. ADR 0061 records the conservative support rule.
Public schemas, approval policy, database state, dependencies, and CI runners are unchanged.

- `pnpm run check`: 1,025 tests, 1,021 passed, four POSIX permission tests skipped on Windows,
  zero failures. This includes all 41 numeric performance cases.
- `pnpm run lint`, `pnpm run format`, and documentation validation: passed.
- Action bundle regenerated; freshness and release-readiness static gates: passed.
- Hosted CI, external model calls, publishing, and deployment were not run for this local fix.

## 2026-10-26 Feedback improvements and CI reuse

All five feedback slices are implemented in local commits: collector redaction, numeric claim
support, selected live PR/batch review, additional contributor candidates, and CI build reuse.
No version, remote branch, tag, npm package, or deployed Action has been changed by this work.

- `pnpm run check`: 1,001 tests, 997 passed, four POSIX permission tests skipped on Windows,
  zero failures.
- `pnpm run lint` and `pnpm run format`: passed.
- `node scripts/release-readiness.mjs`: passed, including docs, secret scan, Action bundle
  freshness, workflow/YAML checks, whitespace and generated-output guards.
- Direct compiled-script CI paths passed: `migration-check.mjs`, both benchmark guards,
  `verify-standalone-cli-package.mjs`, and `smoke.mjs`.
- CI contract tests: all 132 passed; `actionlint .github/workflows/ci.yml` passed.
- Actual public PR `0disoft/clarissimi#9` collected successfully in read-only CLI mode with the
  deterministic provider. No external model call was needed.

CI reuses compiled outputs for five subsequent consumers and performs documentation validation
inside release readiness only. TypeScript compiler invocations decrease from eight to three;
the full test suite still runs once. Permissions, runner count and required job identity are
preserved. Hosted Linux/macOS runs and new public releases were not dispatched in this local task.

Updated sources of truth: ADRs 0006, 0010, 0018, 0061, 0063 and 0064; CLI README and command
contract; monorepo package ownership; and the CI operational contract.

## 2026-10-26 Additional contributor candidates

Live CLI collection now suggests reviewers and linked-issue reporters by stable GitHub account ID
with evidence links, without assigning credit. Seven new GitHub discovery/transport/date cases and
the CLI candidate/staging case pass; the focused GitHub/live-CLI suite passed all 64 tests. Limits,
inaccessible APIs, pending/deleted actors, account renames, and long-key redaction in fetched review
and issue bodies are covered. Existing Action clients keep candidate API calls opt-in. Build and
lint pass; shared Action runtime was regenerated for the collector additions.

An actual read-only CLI run against `0disoft/clarissimi#9` succeeded with the deterministic provider:
11 changed files, one additional candidate, zero reported omissions or unavailable issue lookups.
That run uncovered and fixed GitHub REST UTC timestamps lacking milliseconds before shared source
validation. No external model call or repository write was involved in this live dry-run.

## 2026-10-26 Live CLI and batch review

Added selected real PR collection, explicit staging, optional partial-file coverage, and one-step
hash-bound batch approval/import under existing ledger locks. Shared output planning/options were
extracted without changing the single-draft path. Build and lint pass; all 16 new CLI integration
cases pass, including two-PR publication, stale draft/manifest refusal, duplicate/overlap rejection,
partial evidence reporting, and exclusive staging. The complete GitHub/CLI suite had 347 cases:
343 passed and four POSIX permission cases were skipped on Windows.
These are source-only additions; the published 1.0.1 CLI remains unchanged.

## 2026-10-26 Numeric performance evidence

English and Korean numeric performance claims now require matching linked measurement content;
benchmark paths alone do not support numeric results. The provider suite passed all 100 tests,
including 17 numeric cases and three scrubbed review reproductions promoted into the dirty corpus.
The balanced 28-case synthetic golden corpus is unchanged. Unit conversion and inferred arithmetic
are intentionally left for maintainer review. The Action bundle was regenerated.

## 2026-10-26 Collector redaction boundary

Collector excerpts now redact before normalization and truncation, including incomplete private
keys through end-of-input. Early redaction reports survive provider preparation. The focused
redaction, core, GitHub, and provider suite passed all 155 tests on Windows. The shared Action
bundle was regenerated. No remote publication was performed.

## 2026-10-26 Compatible 1.0.1 publication

Action `v1.0.1` and standalone CLI `clarissimi@1.0.1` are published from
`20991a4cdd55208bb6c37d798e44eae263ad0537`. Exact-source, immutable-tag,
Marketplace, moving-`v1` and registry consumer evidence is recorded in `docs/ops/release.md`.

Local `pnpm run check` completed 952 tests: 948 passed, four POSIX permission cases
skipped on Windows, zero failures. Hosted Linux CI completed 950 tests with no skips
or failures. Release readiness (including secret scan and Action bundle freshness),
docs, lint, format, migration-check, smoke and installed CLI package verification
passed. `check` already executes the same typecheck and test pair as `contract`,
so that identical pair was not rerun under a second script name.

Release validation exposed a false path-overlap rejection during concurrent imports.
A deterministic regression reproduced rounding of adjacent 64-bit file IDs in the
old number-based comparison; `bigint` stat identities fix it. The regression, concurrent
imports and hard-link checks passed after the fix. Synthetic PEM fixture markers
now construct the same strings without weakening the release secret scan.

The maintainer approved the OIDC-staged npm package with 2FA. Exact registry installation,
CLI help, fixture dry-run and signature/provenance audit passed, and the published
tarball hash matches the reviewed four-file package. No public API, ledger schema, DB,
permission, runner or hygiene-policy change. ADR 0039 documents exact file identities;
ADR 0062 records the compatible patch scope.

## 2026-10-12 Installed standalone CLI workflow

The local package verifier previously stopped at installed `--help`. It now
installs the locally built dependency-free tarball with lifecycle scripts disabled
and runs stage-draft, an unapproved import rejection (exit 6, no output creation),
approve-draft with saved digest, approved import, damaged-derived-output rebuild,
and rebuild --check. Canonical bytes stay unchanged during repair, and recursive
fixture inspection finds no remaining generation files or locks.

`pnpm run verify:cli-package` passed on Windows Node v24.18.0. Six package-contract
tests, lint, docs (158 Markdown files), format and diff checks passed. The initial
new rejection assertion incorrectly expected full issues in CLI JSON; the actual
public contract projects issueCodes, which the final passing verifier checks.
This failure was in the verifier, not evidence of an approval bypass.

ADR 0056 now names the installed workflow checks. No package version, persisted
schema, public CLI signature, DB, runner, CI or hygiene change. No remote publish,
GitHub write or provider call. The unchanged repository-wide suite from the prior
storage patch was not repeated; focus was the changed package verifier and real
installed bundle. Registry installation and other operating systems remain
unverified in this run.

## 2026-10-12 CLI generation rollback

Three regressions reproduced partial output replacement before the fix: failure
on the second derived file or canonical ledger kept earlier files on the new
generation, and a newly created output remained after a later failure.

The existing atomic writer now prepares exclusive same-directory recovery copies
before replacement and restores successful replacements in reverse order after
a normal replacement failure. New outputs are removed. Failed restoration keeps
the recovery copy and reports its path while attempting the remaining restores.
Copies stay on disk rather than duplicating large ledgers in memory. Existing
ledger locks, commit-point order, link checks and access-bit handling remain.

- `pnpm run check`: TypeScript/build and 931 tests completed, 927 passed, four
  POSIX permission cases skipped on Windows, zero failures. Node v24.18.0.
- Fault injection covers later rename failure, new destination removal, partial
  backup preparation failure, backup name collision, failed rollback with retained
  bytes, continued recovery, and existing cleanup/permission behavior. An initial
  existing cleanup assertion counted only staging files; it now also counts the
  prepared recovery copies in the rename-failure case.
- `pnpm run lint`, `pnpm run docs` (158 Markdown files), `pnpm run smoke`, changed
  file format check and `git diff --check` passed. Smoke runs the built CLI against
  temporary fixtures. Action publishing tests use local Git fixtures and injected
  clients; they do not publish this patch remotely.
- ADR 0039 now documents rollback, retained recovery files, extra disk space and
  crash limits. No root public API, ledger schema, DB, dependency, version, runner,
  CI or repository-hygiene change. No push, publication or deployment.
- Power loss, killed-process recovery, POSIX restoration permissions, externally
  edited files that ignore the CLI lock, real providers and hosted release checks
  remain unverified. The patch adds normal failure recovery, not crash atomicity.

- Status: Draft

## Validation Source of Truth

This document owns stable validation names for this scaffold.

## Standard Validation Names

- format
- lint
- typecheck
- test
- contract
- migration-check
- smoke
- docs
- check
- release-readiness

## Required Final Report

Final responses must list executed validations, passed validations, skipped validations, skip reasons, and remaining risk.

## Runner Policy

Task runner files are optional. Runner `none` means no executable task runner is generated.
If a runner is generated, runner command names must match this document.
Unconfigured runner commands must fail, not pass with a fake success.

## Hygiene Validation

Repository hygiene file changes must check line-ending churn, binary diff pollution,
tracked secret files, ignored build/cache artifacts, and generated-output drift.

## Scope

general validation routes must stay stack-neutral unless a runner file explicitly defines a command.

## Repository Shape

monorepo, cli-tool, github-action validation must stay repository-shape focused and must not imply generated application source code.
