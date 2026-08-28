import { createRequire } from "node:module";
import {
  basename,
  dirname,
  isAbsolute,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  codePointCompare,
  failLegacy,
} from "./animation-source-legacy-common-v2.mjs";
import { readTrackedCodeV2 } from "./animation-source-legacy-read-v2.mjs";
import { listTrackedPathsV2 } from "./animation-source-legacy-tracked-v2.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const CANONICAL_RELATIVE_PATH = "scripts/lib/animation-source-bundle.mjs";
const CONFIG_BASENAMES = new Set([
  "deno.json",
  "deno.jsonc",
  "import-map.json",
  "import_map.json",
  "importmap.json",
  "package.json",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRelevantConfigPath(trackedPath) {
  const name = basename(trackedPath).toLocaleLowerCase("en-US");
  return (
    CONFIG_BASENAMES.has(name) ||
    /^tsconfig(?:\..+)?\.json$/u.test(name) ||
    /^jsconfig(?:\..+)?\.json$/u.test(name)
  );
}

function parseConfiguration(trackedPath, source) {
  const name = basename(trackedPath).toLocaleLowerCase("en-US");
  if (
    name === "package.json" ||
    name.endsWith("importmap.json") ||
    name === "import-map.json" ||
    name === "import_map.json"
  ) {
    try {
      return JSON.parse(source);
    } catch (error) {
      failLegacy(
        "ANIMATION_SOURCE_LEGACY_CONFIG_JSON_INVALID",
        `${trackedPath}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const parsed = ts.parseConfigFileTextToJson(trackedPath, source);
  if (parsed.error) {
    failLegacy(
      "ANIMATION_SOURCE_LEGACY_CONFIG_JSON_INVALID",
      `${trackedPath}:${ts.flattenDiagnosticMessageText(parsed.error.messageText, " ")}`,
    );
  }
  return parsed.config;
}

function collectStrings(value, field, alias, output) {
  if (typeof value === "string") {
    output.push(Object.freeze({ field, alias, target: value }));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectStrings(entry, `${field}[${index}]`, alias, output),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value).sort(
    ([left], [right]) => codePointCompare(left, right),
  )) {
    collectStrings(entry, `${field}.${key}`, alias ?? key, output);
  }
}

function packageEntries(document) {
  const output = [];
  for (const field of ["imports", "exports", "browser"]) {
    if (!(field in document)) continue;
    const value = document[field];
    if (isObject(value)) {
      for (const [alias, target] of Object.entries(value).sort(
        ([left], [right]) => codePointCompare(left, right),
      )) {
        collectStrings(target, `${field}.${alias}`, alias, output);
      }
    } else {
      collectStrings(value, field, field, output);
    }
  }
  return output;
}

function pathEntries(document) {
  const output = [];
  const paths = document?.compilerOptions?.paths;
  if (!isObject(paths)) return output;
  for (const [alias, targets] of Object.entries(paths).sort(
    ([left], [right]) => codePointCompare(left, right),
  )) {
    collectStrings(targets, `compilerOptions.paths.${alias}`, alias, output);
  }
  return output;
}

function importMapEntries(document) {
  const output = [];
  if (isObject(document?.imports)) {
    for (const [alias, target] of Object.entries(document.imports).sort(
      ([left], [right]) => codePointCompare(left, right),
    )) {
      collectStrings(target, `imports.${alias}`, alias, output);
    }
  }
  if (isObject(document?.scopes)) {
    for (const [scope, aliases] of Object.entries(document.scopes).sort(
      ([left], [right]) => codePointCompare(left, right),
    )) {
      if (!isObject(aliases)) continue;
      for (const [alias, target] of Object.entries(aliases).sort(
        ([left], [right]) => codePointCompare(left, right),
      )) {
        collectStrings(target, `scopes.${scope}.${alias}`, alias, output);
      }
    }
  }
  return output;
}

function boundaryIndex(value) {
  const query = value.indexOf("?");
  const fragment = value.indexOf("#", value.startsWith("#") ? 1 : 0);
  const candidates = [query, fragment].filter((entry) => entry >= 0);
  return candidates.length ? Math.min(...candidates) : value.length;
}

function decodeTarget(value) {
  const bounded = value.slice(0, boundaryIndex(value));
  try {
    return decodeURIComponent(bounded);
  } catch {
    return bounded;
  }
}

function portable(value) {
  return value
    .replaceAll("\\", "/")
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
}

function wildcardPattern(value) {
  return new RegExp(
    `^${value
      .split("*")
      .map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".*")}$`,
    "u",
  );
}

function pathFromTarget(target, baseDirectory) {
  const decoded = decodeTarget(target).trim();
  if (!decoded || decoded.startsWith("#")) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(decoded)) {
    if (!decoded.toLocaleLowerCase("en-US").startsWith("file:")) {
      return undefined;
    }
    try {
      return fileURLToPath(decoded);
    } catch {
      return undefined;
    }
  }
  if (
    !decoded.startsWith(".") &&
    !decoded.startsWith("/") &&
    !decoded.includes("/") &&
    !decoded.includes("\\")
  ) {
    return undefined;
  }
  return isAbsolute(decoded) ? decoded : resolve(baseDirectory, decoded);
}

function targetCanReachCanonical(
  target,
  alias,
  baseDirectory,
  canonicalPath,
) {
  const candidate = pathFromTarget(target, baseDirectory);
  if (!candidate) return false;
  const normalizedCandidate = portable(candidate);
  const normalizedCanonical = portable(canonicalPath);
  if (normalizedCandidate === normalizedCanonical) return true;
  if (normalizedCandidate.includes("*")) {
    return wildcardPattern(normalizedCandidate).test(normalizedCanonical);
  }
  if (
    alias.endsWith("/") &&
    (normalizedCandidate.endsWith("/") || target.endsWith("/"))
  ) {
    const prefix = normalizedCandidate.endsWith("/")
      ? normalizedCandidate
      : `${normalizedCandidate}/`;
    return normalizedCanonical.startsWith(prefix);
  }
  return false;
}

function entriesFor(trackedPath, document) {
  const name = basename(trackedPath).toLocaleLowerCase("en-US");
  if (name === "package.json") return packageEntries(document);
  if (/^(?:tsconfig|jsconfig)(?:\..+)?\.json$/u.test(name)) {
    return pathEntries(document);
  }
  return importMapEntries(document);
}

function baseDirectoryFor(trackedPath, document, repositoryRoot) {
  const configDirectory = dirname(
    resolve(repositoryRoot, ...trackedPath.split("/")),
  );
  const name = basename(trackedPath).toLocaleLowerCase("en-US");
  if (/^(?:tsconfig|jsconfig)(?:\..+)?\.json$/u.test(name)) {
    const baseUrl = document?.compilerOptions?.baseUrl;
    if (typeof baseUrl === "string" && baseUrl.trim()) {
      return resolve(configDirectory, baseUrl);
    }
  }
  return configDirectory;
}

export async function inspectAnimationSourceLegacyConfigUsageV2(
  root = process.cwd(),
) {
  const repositoryRoot = resolve(root);
  const canonicalPath = resolve(
    repositoryRoot,
    ...CANONICAL_RELATIVE_PATH.split("/"),
  );
  const tracked = listTrackedPathsV2(repositoryRoot);
  const configPaths = tracked.filter(isRelevantConfigPath);
  const violations = [];
  let scannedBytes = 0;

  for (const trackedPath of configPaths) {
    const observed = await readTrackedCodeV2(repositoryRoot, trackedPath);
    scannedBytes += observed.byteLength;
    const document = parseConfiguration(trackedPath, observed.source);
    if (!isObject(document)) {
      failLegacy("ANIMATION_SOURCE_LEGACY_CONFIG_OBJECT_REQUIRED", trackedPath);
    }
    const baseDirectory = baseDirectoryFor(
      trackedPath,
      document,
      repositoryRoot,
    );
    for (const entry of entriesFor(trackedPath, document)) {
      if (
        !targetCanReachCanonical(
          entry.target,
          entry.alias,
          baseDirectory,
          canonicalPath,
        )
      ) {
        continue;
      }
      violations.push(Object.freeze({
        trackedPath,
        field: entry.field,
        alias: entry.alias,
        target: entry.target,
      }));
    }
  }

  return Object.freeze({
    schema: "evavo.animation-source-legacy-config-usage.v2",
    status: violations.length === 0 ? "passed" : "failed",
    configFileCount: configPaths.length,
    scannedBytes,
    canonicalRelativePath: CANONICAL_RELATIVE_PATH,
    violations: Object.freeze(violations),
    authority: Object.freeze({
      providerExecution: false,
      renderExecution: false,
      publication: false,
      repositoryMutation: false,
      deployment: false,
      githubActionsRequired: false,
      vercelRequired: false,
    }),
  });
}

export async function assertAnimationSourceLegacyConfigUsageV2(
  root = process.cwd(),
) {
  const report = await inspectAnimationSourceLegacyConfigUsageV2(root);
  if (report.status !== "passed") {
    failLegacy(
      "ANIMATION_SOURCE_LEGACY_CONFIG_ALIAS_FORBIDDEN",
      report.violations
        .map((entry) =>
          `${entry.trackedPath}:${entry.field}:${entry.target}`,
        )
        .join(";"),
      report,
    );
  }
  return report;
}
