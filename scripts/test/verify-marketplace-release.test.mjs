import assert from "node:assert/strict";
import test from "node:test";

import { runVerifyMarketplaceRelease } from "../verify-marketplace-release.mjs";

test("accepts the expected Marketplace latest version and rendered Action reference", async () => {
  const runtime = fakeRuntime({
    body: marketplaceHtml("v0.3.1", "0disoft/clarissimi@v0.3.1"),
  });

  const exitCode = await runVerifyMarketplaceRelease(["--version", "v0.3.1"], runtime);

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(runtime.logs.at(-1)), {
    result: "passed",
    version: "v0.3.1",
    latestVersion: "v0.3.1",
    listingUrl: "https://github.com/marketplace/actions/clarissimi",
    expectedActionReference: "0disoft/clarissimi@v0.3.1",
  });
  assert.equal(runtime.fetches.length, 1);
});

test("rejects a stale Marketplace latest version with the exact release edit handoff", async () => {
  const runtime = fakeRuntime({
    body: marketplaceHtml("v0.3.0", "0disoft/clarissimi@v0.2.0"),
  });

  const exitCode = await runVerifyMarketplaceRelease(["--version", "v0.3.1"], runtime);

  assert.equal(exitCode, 1);
  assert.match(runtime.errors.at(-1), /Marketplace lists v0\.3\.0 as Latest, expected v0\.3\.1/);
  assert.match(
    runtime.errors.at(-1),
    /https:\/\/github\.com\/0disoft\/clarissimi\/releases\/edit\/v0\.3\.1/,
  );
});

test("rejects a latest release whose rendered README names an older Action reference", async () => {
  const runtime = fakeRuntime({
    body: marketplaceHtml("v0.3.1", "0disoft/clarissimi@v0.3.0"),
  });

  const exitCode = await runVerifyMarketplaceRelease(["--version", "v0.3.1"], runtime);

  assert.equal(exitCode, 1);
  assert.match(
    runtime.errors.at(-1),
    /rendered README does not contain 0disoft\/clarissimi@v0\.3\.1/,
  );
});

test("rejects malformed inputs before requesting Marketplace", async () => {
  const runtime = fakeRuntime();

  const invalidVersion = await runVerifyMarketplaceRelease(["--version", "v1"], runtime);
  const invalidSlug = await runVerifyMarketplaceRelease(
    ["--version", "v0.3.1", "--slug", "Clarissimi Action"],
    runtime,
  );

  assert.equal(invalidVersion, 2);
  assert.equal(invalidSlug, 2);
  assert.equal(runtime.fetches.length, 0);
});

test("fails closed when Marketplace does not return a parseable HTML listing", async () => {
  const wrongContentType = fakeRuntime({ contentType: "application/json", body: "{}" });
  const missingLatest = fakeRuntime({ body: "<html><body>Clarissimi</body></html>" });

  assert.equal(await runVerifyMarketplaceRelease(["--version", "v0.3.1"], wrongContentType), 1);
  assert.match(wrongContentType.errors.at(-1), /expected text\/html/);

  assert.equal(await runVerifyMarketplaceRelease(["--version", "v0.3.1"], missingLatest), 1);
  assert.match(missingLatest.errors.at(-1), /did not expose a Latest v0\.x\.y release/);
});

function marketplaceHtml(version, actionReference) {
  return `<!doctype html>
    <html>
      <head><script>window.fake = "v0.9.9 Latest";</script></head>
      <body>
        <section><span>${version}</span><strong>Latest</strong></section>
        <article>The current public Action release is <code>${actionReference}</code>.</article>
      </body>
    </html>`;
}

function fakeRuntime(options = {}) {
  const logs = [];
  const errors = [];
  const fetches = [];
  return {
    logs,
    errors,
    fetches,
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
    fetchText: async (url, timeoutMilliseconds) => {
      fetches.push({ url, timeoutMilliseconds });
      return {
        status: options.status ?? 200,
        contentType: options.contentType ?? "text/html; charset=utf-8",
        body: options.body ?? "",
      };
    },
  };
}
