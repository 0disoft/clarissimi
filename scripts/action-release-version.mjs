const authorizedMajorVersions = new Set([0, 1]);
const semanticVersionPattern = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export const AUTHORIZED_ACTION_RELEASE_MAJORS = Object.freeze([0, 1]);

export function parseAuthorizedActionReleaseVersion(value) {
  if (typeof value !== "string") return undefined;
  const match = semanticVersionPattern.exec(value);
  if (match === null) return undefined;

  const major = Number(match[1]);
  if (!authorizedMajorVersions.has(major)) return undefined;

  return Object.freeze({
    version: value,
    major,
    minor: Number(match[2]),
    patch: Number(match[3]),
    alias: `v${major}`,
  });
}

export function isAuthorizedActionReleaseVersion(value) {
  return parseAuthorizedActionReleaseVersion(value) !== undefined;
}

export function isAuthorizedActionMajorAlias(value) {
  return (
    typeof value === "string" &&
    AUTHORIZED_ACTION_RELEASE_MAJORS.includes(Number(value.slice(1))) &&
    /^v(?:0|[1-9][0-9]*)$/.test(value)
  );
}

export function actionMajorAliasForReleaseVersion(value) {
  return parseAuthorizedActionReleaseVersion(value)?.alias;
}

export function isMatchingActionMajorAlias(alias, releaseVersion) {
  return alias === actionMajorAliasForReleaseVersion(releaseVersion);
}

export function findAuthorizedActionReleaseReferences(text, repo) {
  const pattern = new RegExp(
    `${escapeRegExp(repo)}@(v(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*))`,
    "g",
  );
  return [...String(text).matchAll(pattern)]
    .map((match) => match[1])
    .filter(isAuthorizedActionReleaseVersion);
}

export function findLatestAuthorizedActionReleaseVersion(text) {
  const pattern = /\b(v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))\s+Latest\b/g;
  for (const match of String(text).matchAll(pattern)) {
    if (isAuthorizedActionReleaseVersion(match[1])) return match[1];
  }
  return undefined;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
