import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

export const MAX_ANIMATION_SOURCE_LEGACY_SCAN_FILE_BYTES =
  4 * 1024 * 1024;
export const MAX_ANIMATION_SOURCE_LEGACY_SCAN_TOTAL_BYTES =
  128 * 1024 * 1024;

const CODE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const LEGACY_SYMBOL = /\b(?:readJson|writeJsonAtomic)\b/u;
const BUNDLE_MODULE = /animation-source-bundle\.mjs/u;

function fail(code, detail, report) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  if (report !== undefined) error.report = report;
  throw error;
}

function normalizeTrackedPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\u0000") ||
    value.includes("\\") ||
    isAbsolute(value)
  ) {
    fail("ANIMATION_SOURCE_LEGACY_TRACKED_PATH_INVALID", String(value));
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail("ANIMATION_SOURCE_LEGACY_TRACKED_PATH_INVALID", value);
  }
  return value;
}

function isNonProductionPath(path) {
  const name = path.split("/").at(-1) ?? path;
  return (
    path === "scripts/lib/animation-source-bundle.mjs" ||
    path === "scripts/check-animation-source-bundle.mjs" ||
    path === "scripts/lib/animation-source-legacy-boundary.mjs" ||
    name.startsWith("test-") ||
    name.includes(".test.") ||
    name.includes(".spec.") ||
    path.includes("/test/") ||
    path.includes("/tests/") ||
    path.includes("/__tests__/")
  );
}

function trackedFiles(root) {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached"],
    {
      cwd: root,
      encoding: "buffer",
      shell: false,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    fail(
      "ANIMATION_SOURCE_LEGACY_GIT_LIST_FAILED",
      result.error?.message ??
        Buffer.from(result.stderr ?? []).toString("utf8").trim(),
    );
  }
  return Buffer.from(result.stdout ?? [])
    .toString("utf8")
    .split("\u0000")
    .filter(Boolean)
    .map(normalizeTrackedPath)
    .sort((left, right) => left.localeCompare(right));
}

async function readTrackedCode(root, path) {
  const file = resolve(root, ...path.split("/"));
  const relation = relative(root, file);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    fail("ANIMATION_SOURCE_LEGACY_PATH_ESCAPED", path);
  }
  const state = await lstat(file, { bigint: true });
  if (state.isSymbolicLink() || !state.isFile()) {
    fail("ANIMATION_SOURCE_LEGACY_FILE_INVALID", path);
  }
  if (state.size > BigInt(MAX_ANIMATION_SOURCE_LEGACY_SCAN_FILE_BYTES)) {
    fail(
      "ANIMATION_SOURCE_LEGACY_FILE_TOO_LARGE",
      `${path}:${state.size}`,
    );
  }
  const bytes = await readFile(file);
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("ANIMATION_SOURCE_LEGACY_UTF8_INVALID", path);
  }
  return Object.freeze({ source, byteLength: bytes.length });
}

export async function inspectAnimationSourceLegacyUsage(
  root = process.cwd(),
) {
  const repositoryRoot = resolve(root);
  const tracked = trackedFiles(repositoryRoot);
  const codeFiles = tracked.filter((path) =>
    CODE_EXTENSIONS.has(extname(path).toLowerCase()),
  );
  const violations = [];
  let totalBytes = 0;
  let scannedFileCount = 0;

  for (const path of codeFiles) {
    if (isNonProductionPath(path)) continue;
    const observed = await readTrackedCode(repositoryRoot, path);
    totalBytes += observed.byteLength;
    if (totalBytes > MAX_ANIMATION_SOURCE_LEGACY_SCAN_TOTAL_BYTES) {
      fail(
        "ANIMATION_SOURCE_LEGACY_SCAN_TOO_LARGE",
        String(totalBytes),
      );
    }
    scannedFileCount += 1;
    if (
      BUNDLE_MODULE.test(observed.source) &&
      LEGACY_SYMBOL.test(observed.source)
    ) {
      const symbols = ["readJson", "writeJsonAtomic"].filter((symbol) =>
        new RegExp(`\\b${symbol}\\b`, "u").test(observed.source),
      );
      violations.push(
        Object.freeze({
          path,
          symbols: Object.freeze(symbols),
        }),
      );
    }
  }

  return Object.freeze({
    schema: "evavo.animation-source-legacy-usage.v1",
    status: violations.length === 0 ? "passed" : "failed",
    trackedFileCount: tracked.length,
    scannedFileCount,
    scannedBytes: totalBytes,
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

export async function assertAnimationSourceLegacyUsage(
  root = process.cwd(),
) {
  const report = await inspectAnimationSourceLegacyUsage(root);
  if (report.status !== "passed") {
    fail(
      "ANIMATION_SOURCE_LEGACY_PRODUCTION_USAGE_FORBIDDEN",
      report.violations
        .map((entry) => `${entry.path}:${entry.symbols.join(",")}`)
        .join(";"),
      report,
    );
  }
  return report;
}
