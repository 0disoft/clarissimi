# @clarissimi/providers

Contribution draft provider adapters for Clarissimi.

This package owns the provider adapter interface, deterministic fake provider, and SDK-free
OpenAI-compatible HTTP provider. Provider output is validated against shared schemas before it is
returned to callers.

OpenAI-compatible requests default to a 120-second timeout and a 2 MiB response limit. Structured
errors expose whether a caller may retry without including raw provider response bodies.

Provider results pass a deterministic semantic quality validator after shared schema validation.
The validator preserves trusted contributor, source, evidence-reference, and draft-approval fields;
requires repository support for security and high-impact claims; and is covered by a balanced
24-case synthetic pull-request corpus. The corpus checks invariants and issue codes rather than
exact model prose, and it requires no provider credentials.

Provider endpoints default to the `public` trust policy: credential-free HTTPS with a public-form
hostname or address. Trusted self-hosted HTTP or private-network gateways require the explicit
`private-network` endpoint trust option. The default transport validates every resolved address,
pins the connection to one validated address while preserving Host and TLS SNI, verifies the peer
address, and refuses automatic redirects. Configure the final completion endpoint directly.

It does not own schema vocabulary, redaction policy, maintainer approval policy, environment token
loading, or provider-specific behavior inside core, CLI, Action, or renderer packages.

Source of truth:

- [Product specification](../../docs/product/02-spec.md)
- [Package ownership](../../docs/monorepo/package-ownership.md)
