# ADR 0041: Restrict Provider Endpoint Trust

- Status: Accepted
- Date: 2026-07-12
- Owner: Repository maintainers

## Context

Clarissimi accepts an explicit OpenAI-compatible endpoint from CLI flags, configuration, and GitHub
Action inputs. The previous HTTP(S)-only validation allowed cleartext HTTP, loopback, private,
link-local, reserved, and credential-bearing URLs without distinguishing a public service from a
self-hosted gateway.

The endpoint is maintainer-controlled rather than derived from pull request evidence, but an unsafe
workflow or repository configuration could still make a hosted runner send a provider token and
redacted evidence to an unintended network destination.

## Decision

- Endpoint trust defaults to `public`.
- `public` requires a credential-free HTTPS URL and rejects localhost, single-label names, reserved
  hostname suffixes, and literal loopback, private, link-local, carrier-grade NAT, documentation,
  benchmark, multicast, and reserved IP ranges.
- `private-network` is the explicit opt-in for trusted self-hosted gateways. It permits HTTP or
  HTTPS and private destinations, but URL-embedded username or password values remain forbidden.
- Configuration uses `providerEndpointTrust`; the CLI uses
  `--provider-endpoint-trust public|private-network`; the Action uses
  `provider-endpoint-trust: public|private-network`.
- The provider package owns the final endpoint check. Schemas own only the fixed trust vocabulary,
  while CLI and Action pass the selected value without duplicating network policy.
- Provider tokens remain authorization headers and must never be embedded in endpoint URLs.

## Security Boundary

This decision blocks unsafe schemes, hostnames, and literal addresses. It does not resolve a public
hostname and pin its addresses to the subsequent connection. DNS rebinding or a public hostname
that resolves to a private address therefore remains possible in the platform `fetch` layer.
Complete DNS enforcement requires a resolver-aware, connection-pinning transport and is deferred
until Clarissimi owns such a transport boundary.

## Consequences

- Existing public HTTPS endpoints continue to work without configuration changes.
- Existing HTTP, localhost, or private-network endpoints must add the explicit trust opt-in.
- The opt-in is deliberately visible in workflow and configuration review.
- Private-network mode represents maintainer trust; it is not a claim that the destination is safe.

## Validation

- default rejection tests for HTTP, local, private, reserved, IPv4, and IPv6 endpoints
- explicit private-network CLI, Action, and provider tests
- credential-bearing URL rejection in both trust modes
- repository `format`, `lint`, `test`, `smoke`, `check`, and `contract` gates
