import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import {
  ProviderEndpointTrustError,
  buildPinnedEndpointRequestOptions,
  requestPinnedProviderEndpoint,
  resolveProviderEndpointAddress,
} from "../dist/provider-endpoint-transport.js";

test("public endpoint resolution rejects any mixed private answer", async () => {
  await assert.rejects(
    () =>
      resolveProviderEndpointAddress(
        new URL("https://provider.example.com/v1/chat/completions"),
        "public",
        async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      ),
    (error) => error instanceof ProviderEndpointTrustError,
  );
});

test("public endpoint resolution pins the first fully public answer", async () => {
  const selected = await resolveProviderEndpointAddress(
    new URL("https://provider.example.com/v1/chat/completions"),
    "public",
    async (_hostname, options) => {
      assert.deepEqual(options, { all: true, verbatim: true });
      return [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ];
    },
  );

  assert.deepEqual(selected, { address: "93.184.216.34", family: 4 });
});

test("pinned endpoint requests connect to the selected address with original Host and SNI", () => {
  const options = buildPinnedEndpointRequestOptions(
    new URL("https://provider.example.com:8443/v1/chat/completions?mode=json"),
    { address: "93.184.216.34", family: 4 },
    "POST",
    { Authorization: "Bearer unit-token" },
  );

  assert.equal(options.hostname, "93.184.216.34");
  assert.equal(options.family, 4);
  assert.equal(options.port, 8443);
  assert.equal(options.path, "/v1/chat/completions?mode=json");
  assert.equal(options.headers.Host, "provider.example.com:8443");
  assert.equal(options.servername, "provider.example.com");
});

test("public endpoint resolution rejects compressed private IPv6 and IPv4-mapped answers", async () => {
  for (const address of ["fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    await assert.rejects(
      () =>
        resolveProviderEndpointAddress(
          new URL("https://provider.example.com/v1/chat/completions"),
          "public",
          async () => [{ address, family: 6 }],
        ),
      (error) => error instanceof ProviderEndpointTrustError,
    );
  }
});

test("private-network transport connects to the pinned literal address", async (context) => {
  let receivedHost = "";
  let receivedBody = "";
  const server = createServer((request, response) => {
    receivedHost = request.headers.host ?? "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      receivedBody += chunk;
    });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(typeof address, "string");
  assert.notEqual(address, null);

  const response = await requestPinnedProviderEndpoint({
    endpoint: new URL(`http://127.0.0.1:${address.port}/v1/chat/completions`),
    endpointTrust: "private-network",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"model":"test"}',
    signal: new AbortController().signal,
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(receivedHost, `127.0.0.1:${address.port}`);
  assert.equal(receivedBody, '{"model":"test"}');
});

test("pinned transport returns redirects without following them", async (context) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(302, { location: "/redirected" });
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(typeof address, "string");
  assert.notEqual(address, null);

  const response = await requestPinnedProviderEndpoint({
    endpoint: new URL(`http://127.0.0.1:${address.port}/start`),
    endpointTrust: "private-network",
    method: "POST",
    headers: {},
    body: "{}",
    signal: new AbortController().signal,
  });

  assert.equal(response.status, 302);
  assert.equal(requests, 1);
});
