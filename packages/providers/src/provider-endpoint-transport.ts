import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SocketAddress, isIP } from "node:net";
import { Readable } from "node:stream";

export type OpenAiCompatibleEndpointTrust = "public" | "private-network";

export interface ResolvedEndpointAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type EndpointLookup = (
  hostname: string,
  options: { readonly all: true; readonly verbatim: true },
) => Promise<readonly { readonly address: string; readonly family: number }[]>;

export interface PinnedEndpointRequestOptions {
  readonly protocol: "http:" | "https:";
  readonly hostname: string;
  readonly family: 4 | 6;
  readonly port: number;
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly servername?: string;
}

export interface PinnedProviderRequestInput {
  readonly endpoint: URL;
  readonly endpointTrust: OpenAiCompatibleEndpointTrust;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
}

export class ProviderEndpointTrustError extends Error {
  constructor() {
    super("OpenAI-compatible public endpoint resolved to a non-public network address.");
    this.name = "ProviderEndpointTrustError";
  }
}

export class ProviderEndpointResolutionError extends Error {
  constructor() {
    super("OpenAI-compatible provider endpoint could not be resolved.");
    this.name = "ProviderEndpointResolutionError";
  }
}

export async function requestPinnedProviderEndpoint(
  input: PinnedProviderRequestInput,
): Promise<Response> {
  const pinned = await resolveProviderEndpointAddress(input.endpoint, input.endpointTrust);
  const options = buildPinnedEndpointRequestOptions(
    input.endpoint,
    pinned,
    input.method,
    input.headers,
  );
  return await executePinnedRequest(options, input.body, input.signal, pinned);
}

export async function resolveProviderEndpointAddress(
  endpoint: URL,
  trust: OpenAiCompatibleEndpointTrust,
  lookup: EndpointLookup = dnsLookup,
): Promise<ResolvedEndpointAddress> {
  const hostname = normalizeUrlHostname(endpoint.hostname);
  const literalFamily = isIP(hostname);
  let addresses: readonly { readonly address: string; readonly family: number }[];
  try {
    addresses =
      literalFamily === 0
        ? await lookup(hostname, { all: true, verbatim: true })
        : [{ address: hostname, family: literalFamily }];
  } catch {
    throw new ProviderEndpointResolutionError();
  }

  if (addresses.length === 0) {
    throw new ProviderEndpointResolutionError();
  }

  const normalized = addresses.map(normalizeResolvedAddress);
  if (trust === "public" && normalized.some((address) => !isPublicNetworkAddress(address))) {
    throw new ProviderEndpointTrustError();
  }

  const selected = normalized[0];
  if (selected === undefined) {
    throw new ProviderEndpointResolutionError();
  }
  return selected;
}

export function buildPinnedEndpointRequestOptions(
  endpoint: URL,
  pinned: ResolvedEndpointAddress,
  method: string,
  headers: Readonly<Record<string, string>>,
): PinnedEndpointRequestOptions {
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new ProviderEndpointTrustError();
  }
  const originalHostname = normalizeUrlHostname(endpoint.hostname);
  const port =
    endpoint.port.length > 0 ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80;
  return {
    protocol: endpoint.protocol,
    hostname: pinned.address,
    family: pinned.family,
    port,
    method,
    path: `${endpoint.pathname}${endpoint.search}`,
    headers: {
      ...headers,
      Host: endpoint.host,
    },
    ...(endpoint.protocol === "https:" && isIP(originalHostname) === 0
      ? { servername: originalHostname }
      : {}),
  };
}

export function isPublicNetworkAddress(address: ResolvedEndpointAddress): boolean {
  const numeric =
    address.family === 4
      ? ipv4ToBigInt(canonicalAddress(address.address, address.family))
      : ipv6ToBigInt(canonicalAddress(address.address, address.family));
  const bits = address.family === 4 ? 32n : 128n;
  const subnets = address.family === 4 ? NON_PUBLIC_IPV4_SUBNETS : NON_PUBLIC_IPV6_SUBNETS;
  return !subnets.some(({ network, prefix }) => isInSubnet(numeric, network, prefix, bits));
}

async function executePinnedRequest(
  options: PinnedEndpointRequestOptions,
  body: string,
  signal: AbortSignal,
  pinned: ResolvedEndpointAddress,
): Promise<Response> {
  return await new Promise<Response>((resolve, reject) => {
    const request = (options.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        hostname: options.hostname,
        family: options.family,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
        signal,
        ...(options.servername === undefined ? {} : { servername: options.servername }),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status > 599) {
          response.destroy();
          reject(new Error("OpenAI-compatible provider returned an unsupported HTTP status."));
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(name, item);
            }
          } else if (value !== undefined) {
            headers.set(name, String(value));
          }
        }
        const hasNoBody = status === 204 || status === 205 || status === 304;
        const stream = hasNoBody ? null : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
        resolve(new Response(stream, { status, headers }));
      },
    );

    request.once("socket", (socket) => {
      socket.once("connect", () => {
        const remoteAddress = socket.remoteAddress;
        const remoteFamily = remoteAddress === undefined ? 0 : isIP(remoteAddress);
        if (
          remoteAddress === undefined ||
          remoteFamily !== pinned.family ||
          canonicalAddress(remoteAddress, pinned.family) !==
            canonicalAddress(pinned.address, pinned.family)
        ) {
          request.destroy(new ProviderEndpointTrustError());
        }
      });
    });
    request.once("error", reject);
    request.end(body);
  });
}

function normalizeResolvedAddress(value: {
  readonly address: string;
  readonly family: number;
}): ResolvedEndpointAddress {
  const family = isIP(value.address);
  if ((value.family !== 4 && value.family !== 6) || family !== value.family) {
    throw new ProviderEndpointResolutionError();
  }
  return {
    address: canonicalAddress(value.address, value.family),
    family: value.family,
  };
}

function canonicalAddress(value: string, family: 4 | 6): string {
  try {
    return new SocketAddress({
      address: value,
      family: family === 4 ? "ipv4" : "ipv6",
    }).address;
  } catch {
    throw new ProviderEndpointResolutionError();
  }
}

function normalizeUrlHostname(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

function ipv4ToBigInt(value: string): bigint {
  const parts = value.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new ProviderEndpointResolutionError();
  }
  return parts.reduce((result, part) => (result << 8n) | BigInt(part), 0n);
}

function ipv6ToBigInt(value: string): bigint {
  let normalized = value.toLowerCase();
  const ipv4Tail = /(?<ipv4>\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.groups?.ipv4;
  if (ipv4Tail !== undefined) {
    const numeric = ipv4ToBigInt(ipv4Tail);
    normalized = normalized.replace(
      ipv4Tail,
      `${((numeric >> 16n) & 0xffffn).toString(16)}:${(numeric & 0xffffn).toString(16)}`,
    );
  }

  const halves = normalized.split("::");
  if (halves.length > 2) {
    throw new ProviderEndpointResolutionError();
  }
  const left = halves[0]?.length === 0 ? [] : (halves[0]?.split(":") ?? []);
  const right = halves.length === 1 || halves[1]?.length === 0 ? [] : (halves[1]?.split(":") ?? []);
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    throw new ProviderEndpointResolutionError();
  }
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    throw new ProviderEndpointResolutionError();
  }
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function isInSubnet(value: bigint, network: bigint, prefix: bigint, bits: bigint): boolean {
  const shift = bits - prefix;
  return value >> shift === network >> shift;
}

function createIpv4Subnets(): readonly { readonly network: bigint; readonly prefix: bigint }[] {
  return (
    [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ] as const
  ).map(([network, prefix]) => ({
    network: ipv4ToBigInt(network),
    prefix: BigInt(prefix),
  }));
}

function createIpv6Subnets(): readonly { readonly network: bigint; readonly prefix: bigint }[] {
  return (
    [
      ["::", 128],
      ["::1", 128],
      ["::ffff:0:0", 96],
      ["64:ff9b::", 96],
      ["64:ff9b:1::", 48],
      ["100::", 64],
      ["2001::", 23],
      ["2001:db8::", 32],
      ["2002::", 16],
      ["fc00::", 7],
      ["fe80::", 10],
      ["ff00::", 8],
    ] as const
  ).map(([network, prefix]) => ({
    network: ipv6ToBigInt(network),
    prefix: BigInt(prefix),
  }));
}

const NON_PUBLIC_IPV4_SUBNETS = createIpv4Subnets();
const NON_PUBLIC_IPV6_SUBNETS = createIpv6Subnets();
