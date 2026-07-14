import { get } from "node:https";
import { pathToFileURL } from "node:url";

const defaults = {
  repo: "0disoft/clarissimi",
  slug: "clarissimi",
  marketplaceBaseUrl: "https://github.com/marketplace/actions",
  timeoutMilliseconds: 30_000,
};

const usageText = [
  "Usage:",
  "  pnpm run verify-marketplace-release -- --version <v0.x.y> [--repo <owner/name>] [--slug <marketplace-slug>]",
  "",
  "Verifies that the public GitHub Marketplace page marks the expected immutable release as Latest and renders its matching Action reference.",
].join("\n");

export async function runVerifyMarketplaceRelease(argv, runtime = defaultRuntime()) {
  try {
    return await run(argv, runtime);
  } catch (error) {
    if (error instanceof UsageError) return error.exitCode;
    runtime.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function run(argv, runtime) {
  const args = parseArgs(argv, runtime);
  if (args.help) {
    runtime.log(usageText);
    return 0;
  }

  const repo = args.repo ?? defaults.repo;
  const slug = args.slug ?? defaults.slug;
  if (!isVersion(args.version))
    return usageFailure(runtime, "--version requires an immutable v0.x.y tag.");
  if (!isRepo(repo)) return usageFailure(runtime, "--repo must use owner/name format.");
  if (!isSlug(slug))
    return usageFailure(
      runtime,
      "--slug must use lowercase letters, numbers, and single hyphens between words.",
    );

  const listingUrl = `${defaults.marketplaceBaseUrl}/${slug}`;
  const releaseEditUrl = `https://github.com/${repo}/releases/edit/${args.version}`;
  const response = await runtime.fetchText(listingUrl, defaults.timeoutMilliseconds);
  if (response.status !== 200) {
    throw new Error(
      `Marketplace listing request returned HTTP ${response.status}; expected 200 for ${listingUrl}.`,
    );
  }
  if (!response.contentType.toLowerCase().includes("text/html")) {
    throw new Error(
      `Marketplace listing returned ${response.contentType || "an unknown content type"}; expected text/html.`,
    );
  }

  const pageText = htmlToText(response.body);
  const latestVersion = findLatestVersion(pageText);
  if (latestVersion === undefined) {
    throw new Error(
      `Marketplace listing did not expose a Latest v0.x.y release. Check ${listingUrl} and update ${releaseEditUrl}.`,
    );
  }
  if (latestVersion !== args.version) {
    throw new Error(
      `Marketplace lists ${latestVersion} as Latest, expected ${args.version}. Publish the expected release at ${releaseEditUrl}, then retry.`,
    );
  }

  const expectedActionReference = `${repo}@${args.version}`;
  if (!pageText.includes(expectedActionReference)) {
    throw new Error(
      `Marketplace lists ${args.version} as Latest but its rendered README does not contain ${expectedActionReference}. Publish a corrective immutable release whose README names the current Action reference.`,
    );
  }

  runtime.log(
    JSON.stringify(
      {
        result: "passed",
        version: args.version,
        latestVersion,
        listingUrl,
        expectedActionReference,
      },
      null,
      2,
    ),
  );
  return 0;
}

function parseArgs(argv, runtime) {
  const parsed = {};
  const valueOptions = new Map([
    ["version", "version"],
    ["repo", "repo"],
    ["slug", "slug"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) return usageFailure(runtime, `Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (!valueOptions.has(key)) return usageFailure(runtime, `Unsupported option: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      return usageFailure(runtime, `${arg} requires a value.`);
    parsed[valueOptions.get(key)] = value;
    index += 1;
  }
  return parsed;
}

function htmlToText(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  const named = new Map([
    ["amp", "&"],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["nbsp", " "],
    ["quot", '"'],
  ]);
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return safeCodePoint(Number.parseInt(entity.slice(2), 16), match);
    }
    if (entity.startsWith("#")) {
      return safeCodePoint(Number.parseInt(entity.slice(1), 10), match);
    }
    return named.get(entity.toLowerCase()) ?? match;
  });
}

function safeCodePoint(codePoint, fallback) {
  try {
    return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : fallback;
  } catch {
    return fallback;
  }
}

function findLatestVersion(pageText) {
  return pageText.match(/\b(v0\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))\s+Latest\b/)?.[1];
}

function isRepo(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isVersion(value) {
  return typeof value === "string" && /^v0\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(value);
}

function usageFailure(runtime, message) {
  runtime.error(message);
  runtime.error(usageText);
  throw new UsageError();
}

class UsageError extends Error {
  constructor() {
    super("Invalid command usage.");
    this.exitCode = 2;
  }
}

function defaultRuntime() {
  return {
    log: console.log,
    error: console.error,
    fetchText: requestText,
  };
}

function requestText(url, timeoutMilliseconds, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          Accept: "text/html",
          "User-Agent": "clarissimi-marketplace-verifier",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location !== undefined) {
          response.resume();
          if (redirectsRemaining === 0) {
            reject(new Error("Marketplace listing exceeded the redirect limit."));
            return;
          }
          const redirectUrl = new URL(location, url);
          if (redirectUrl.protocol !== "https:") {
            reject(new Error("Marketplace listing redirected outside HTTPS."));
            return;
          }
          resolve(requestText(redirectUrl.href, timeoutMilliseconds, redirectsRemaining - 1));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 5_000_000) {
            request.destroy(new Error("Marketplace listing exceeded the response size limit."));
          }
        });
        response.on("end", () => {
          resolve({
            status,
            contentType: String(response.headers["content-type"] ?? ""),
            body,
          });
        });
      },
    );
    request.setTimeout(timeoutMilliseconds, () => {
      request.destroy(new Error("Marketplace listing request timed out."));
    });
    request.on("error", reject);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runVerifyMarketplaceRelease(process.argv.slice(2)));
}
