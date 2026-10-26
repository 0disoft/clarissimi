# ADR 0010: Add Redaction Package Boundary

- Status: Accepted
- Owner: Repository maintainers

## Context

Clarissimi reads public repository evidence before preparing recognition drafts. Even public
repository text can contain accidental secrets, private contact details, prompt injection, or
security-sensitive details. The product specification requires redaction before provider calls.

Redaction needs to be available before any provider adapter, GitHub collector, CLI recognition
command, or GitHub Action sends evidence across a trust boundary.

## Decision

Implement `packages/redaction` as a narrow package for deterministic redaction.

The package owns:

- string redaction
- JSON-like value redaction
- redaction reports with match kinds and replacement metadata
- default masking for email addresses, environment-style secret assignments, private key blocks,
  GitHub token-like strings, and common provider token-like strings

Private-key scanning shares one label vocabulary for both BEGIN and END boundaries. In addition
to the existing labels, it covers encrypted PKCS #8 (`ENCRYPTED PRIVATE KEY`,
[RFC 7468 section 11](https://www.rfc-editor.org/rfc/rfc7468.html#section-11)) and OpenPGP private-key
armor (`PGP PRIVATE KEY BLOCK`,
[RFC 9580 section 6.2.1](https://www.rfc-editor.org/rfc/rfc9580.html#section-6.2.1)). Matched bodies
are masked without validating key material. Incomplete blocks mask the remaining input, and the
forward scan avoids repeatedly rescanning unterminated headers. Public-key and certificate labels
are excluded. Provider preparation and repository-visible checks reuse this shared policy.

The shared GitHub token rule covers `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, and fine-grained
`github_pat_` prefixes under the existing `github_token` report kind. Detection keeps the existing
minimum of 16 token-body characters and word boundaries; it identifies token-like text rather than
verifying whether a credential is valid. Provider preparation and repository-visible text checks
must both use this shared rule, including for values inside nonsensitive JSON fields.

Generic secret assignment detection accepts a closing quote after the existing `token`, `secret`,
`password`, and `api[_-]?key` keywords. This masks quoted JSON keys in evidence strings, including
file text and diffs, before they are copied into provider evidence items and reference excerpts.
The existing eight-character minimum, rule order, and `generic_secret_assignment` report kind
remain unchanged. Regressions cover 56 quoted-key/value and separator combinations, occurrence
offsets, longer nonsensitive key names, and the request body captured by an injected provider.

Text assignment detection and structured JSON key detection derive their patterns from one shared
sensitive-key vocabulary. The vocabulary preserves the union of the former text and JSON rules,
including OAuth tokens, client secrets, authorization, cookies, private keys, and signatures.
Compound names accept underscore, hyphen, and joined case-insensitive spellings, so `access_token`,
`access-token`, and `accessToken` are covered in both representations. JSON matching remains anchored
to the entire trimmed key; longer unrelated names remain unchanged. Text value-length thresholds,
rule order, and report kinds remain unchanged. Patterns are compiled once at module initialization.

Same-line `Authorization` and `Proxy-Authorization` text assignments receive a scheme-aware rule
before token and generic assignment rules run. The scheme uses the HTTP token grammar instead of
a Basic/Bearer/Negotiate allowlist. HTTP credentials can carry a token or comma-separated
authentication parameters ([RFC 9110 section 11.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-11.4));
both forms must be consumed as one redacted assignment. Parameter names accept HTTP token
characters, optional whitespace around equals signs, and empty comma-list members. Values use the
shared escape-aware quoted grammar or token characters, with slash-separated AWS scope components
also accepted. Quoted parameter values can contain commas and whitespace without ending the field.

Quoted whole values or individual credentials are consumed in full; missing closing quotes mask
the remaining quoted content on the same line. Unquoted token credentials end at whitespace or a
quote, and parameter lists end after their final value. Following lines and unrelated fields remain
available as evidence. Even short credentials are covered in this explicit context; the general
eight-character threshold and `generic_secret_assignment` report kind remain unchanged. Matching
stays on one line and excludes longer unrelated field names. Quoted scheme parsing requires a
non-whitespace first value character so unterminated whitespace-only values cannot trigger
overlapping-quantifier backtracking. This is conservative text masking, not credential validation.

Quoted assignment values share an escape-aware character grammar across dotenv, generic sensitive
keys, and authorization schemes. A backslash consumes the following non-newline character;
an escaped quote is content, while an unescaped quote ends the value. Missing closing quotes mask
the remaining value on the same line. The generic eight-character minimum is checked against the
captured raw value content, preserving its existing UTF-16 length semantics even for escapes.
Replacement offsets are taken from the argument preceding the input, so positional value captures
cannot corrupt occurrence locations. Reports still contain no matched value. Regressions cover
quote/backslash parity, complete and truncated values, length boundaries, preparation and captured
provider requests, and child-process deadlines for long escape and whitespace sequences.

Cookie and Set-Cookie text fields receive an opaque-value rule before token and generic rules.
Case-insensitive `cookie` and `set_cookie` naming variants share the existing underscore/hyphen/
joined spelling policy. A quoted value uses the common escape-aware grammar. An unquoted value
consumes the rest of that line, including spaces, quoted cookie components, attributes, and any
trailing prose; whitespace cannot expose later session components. Following lines remain outside
the match. Explicit cookie fields have no eight-character minimum, matching the sensitivity of
structured cookie keys; general thresholds and report kinds remain unchanged. This deliberately
favors masking the complete field over interpreting individual cookie names or preserving inline
explanations after unquoted cookie data.

URL authority userinfo is masked before assignment, token, and email rules. A forward scan of
maximal scheme tokens followed by `://` examines each authority once, avoiding an unbounded
scheme-expression retry at every character. Any nonempty userinfo before the authority's last
`@` is replaced, including username-only and percent-encoded values, without a length threshold.
This works for HTTP and connection-string schemes, single-label hosts, IP literals, and IPv6.
Scheme, host, port, path, query, and fragment remain available as evidence; `@` in a path, query,
or fragment does not indicate userinfo. Double quotes, whitespace, angle brackets, backticks, and
backslashes delimit authorities; raw apostrophes in userinfo remain inside the masked region.
Existing `generic_secret_assignment` report vocabulary is reused;
reports contain offsets only. This text detector masks credential-shaped authority content without
validating a URL or contacting its host. Encoded whole URLs and secrets in paths or query parameters
are not newly covered by this rule. Structural evidence IDs and URLs reject detected userinfo rather
than accepting a modified reference.

The package must not own:

- provider API calls
- prompt construction
- security severity decisions
- maintainer approval
- GitHub evidence collection
- ledger rendering

## Consequences

Provider and GitHub packages must call redaction before sending evidence to any external model
provider or writing public generated text.

Redaction reports intentionally record match kind and location metadata, not the matched secret
value. This keeps diagnostic output useful without creating a second leak path.

The first implementation uses deterministic regular expressions and no external dependency. A later
ADR may add configurable rules or structured detectors if tests show the default set is too small.

The 2026-10-26 email matcher first scans maximal local-part tokens and checks whether each is
followed by `@`. It attempts the existing email expression only at the token's first word boundary,
using a sticky expression to prevent retries at later boundaries after a failed domain match.
Successful matches advance the token scanner past the matched address. This keeps email scanning
linear in input length instead of quadratic on repeated `a.` near misses, while preserving masking
order, accepted addresses, and occurrence offsets. A child-process deadline regression covers long
near misses and a 512 KiB text; compatibility cases cover punctuation and adjacent addresses.

Private-key block masking scans BEGIN and END markers separately. Successful matches advance past
the matched END; if the first pending BEGIN has no END, its entire suffix is masked because it can
still contain key material. This bounds delimiter scanning to linear time instead of rescanning an
unterminated suffix for every BEGIN. Existing accepted marker prefixes, mismatched prefix behavior,
replacement order, and occurrence offsets remain unchanged. Compatibility cases
cover nesting and overlapping markers, and a child-process deadline covers repeated unterminated
headers, including a tail after a complete block.

## Review Blockers

- A provider adapter can receive raw evidence without redaction.
- Redaction reports include matched secret values.
- Redaction mutates object shape when only string values should be masked.
- Security impact is inferred from redaction alone without maintainer confirmation.
