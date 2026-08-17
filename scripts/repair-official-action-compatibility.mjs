import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const TEMPORARY_PATHS = new Set([
  ".github/workflows/repair-official-action-compatibility-v2.yml",
  "scripts/repair-official-action-compatibility.mjs",
]);
const SCANNER_PATH = "scripts/test-ci-media-tool-official-action-releases.mjs";
const COMPATIBLE_PNPM_ACTION =
  "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86";

const REPLACEMENTS = [
  {
    from: "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2 # v2.0.2",
    to: `${COMPATIBLE_PNPM_ACTION} # v6.0.10`,
  },
  {
    from: "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2",
    to: COMPATIBLE_PNPM_ACTION,
  },
  {
    from: "pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4.4.0",
    to: `${COMPATIBLE_PNPM_ACTION} # v6.0.10`,
  },
  {
    from: "pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320",
    to: COMPATIBLE_PNPM_ACTION,
  },
  {
    from: "actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955",
    to: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  },
  {
    from: "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    to: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  },
  {
    from: "actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238",
    to: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  },
  {
    from: "actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405",
    to: "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97",
  },
  {
    from: "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    to: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  },
  {
    from: "84cb39b217b10273981911c288cd62326dc7c6d2",
    to: "0977fd99725f1db4007ccb2928dbb4e90d06cc86",
  },
  {
    from: "fc06bc1257f339d1d5d8b3a19a8cae5388b55320",
    to: "0977fd99725f1db4007ccb2928dbb4e90d06cc86",
  },
  {
    from: "08eba0b27e820071cde6df949e0beb9ba4906955",
    to: "3d3c42e5aac5ba805825da76410c181273ba90b1",
  },
  {
    from: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    to: "3d3c42e5aac5ba805825da76410c181273ba90b1",
  },
  {
    from: "6044e13b5dc448c55e2357c09f80417699197238",
    to: "820762786026740c76f36085b0efc47a31fe5020",
  },
  {
    from: "a309ff8b426b58ec0e2a45f0f869d46889d02405",
    to: "5fda3b95a4ea91299a34e894583c3862153e4b97",
  },
  {
    from: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    to: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  },
];

function parseManifestPath() {
  const index = process.argv.indexOf("--manifest");
  assert.notEqual(index, -1, "--manifest is required");
  const value = process.argv[index + 1];
  assert.ok(value, "--manifest requires a path");
  return path.resolve(value);
}

function occurrenceCount(source, value) {
  return source.split(value).length - 1;
}

function updateScanner() {
  const before = readFileSync(SCANNER_PATH, "utf8");
  const oldApproved = `  [\n    "pnpm/setup",\n    "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2",\n  ],`;
  const newApproved = `  [\n    "pnpm/action-setup",\n    "${COMPATIBLE_PNPM_ACTION}",\n  ],`;
  const oldReplaced = `const REPLACED_ACTIONS = new Map([\n  [\n    "pnpm/action-setup",\n    "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2",\n  ],\n]);`;
  const newReplaced = `const REPLACED_ACTIONS = new Map([\n  [\n    "pnpm/setup",\n    "${COMPATIBLE_PNPM_ACTION}",\n  ],\n]);`;

  assert.equal(occurrenceCount(before, oldApproved), 1);
  assert.equal(occurrenceCount(before, oldReplaced), 1);
  const after = before.replace(oldApproved, newApproved).replace(oldReplaced, newReplaced);
  assert.notEqual(after, before);
  writeFileSync(SCANNER_PATH, after, "utf8");
  return {
    path: SCANNER_PATH,
    reason: "compatible-pnpm-policy",
  };
}

const trackedPaths = execFileSync("git", ["ls-files", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .sort();

const totals = Object.fromEntries(REPLACEMENTS.map(({ from }) => [from, 0]));
const changed = [updateScanner()];

for (const filePath of trackedPaths) {
  if (
    TEMPORARY_PATHS.has(filePath) ||
    filePath === SCANNER_PATH ||
    !existsSync(filePath) ||
    lstatSync(filePath).isSymbolicLink()
  ) {
    continue;
  }

  const bytes = readFileSync(filePath);
  if (bytes.includes(0)) continue;

  const before = bytes.toString("utf8");
  let after = before;
  const fileReplacements = {};
  for (const replacement of REPLACEMENTS) {
    const count = occurrenceCount(after, replacement.from);
    if (count === 0) continue;
    after = after.split(replacement.from).join(replacement.to);
    totals[replacement.from] += count;
    fileReplacements[replacement.from] = count;
  }

  if (after === before) continue;
  writeFileSync(filePath, after, "utf8");
  changed.push({ path: filePath, replacements: fileReplacements });
}

const pnpmWorkflowChanges = changed.filter(
  (entry) =>
    entry.path.startsWith(".github/workflows/") &&
    entry.replacements?.[
      "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2 # v2.0.2"
    ] === 1,
);
assert.equal(pnpmWorkflowChanges.length, 36);

const forbidden = REPLACEMENTS.map(({ from }) => from);
const violations = [];
for (const filePath of trackedPaths) {
  if (
    TEMPORARY_PATHS.has(filePath) ||
    !existsSync(filePath) ||
    lstatSync(filePath).isSymbolicLink()
  ) {
    continue;
  }
  const bytes = readFileSync(filePath);
  if (bytes.includes(0)) continue;
  const source = bytes.toString("utf8");
  for (const reference of forbidden) {
    if (source.includes(reference)) violations.push(`${filePath}: ${reference}`);
  }
}
assert.deepEqual(violations, []);

const manifest = {
  schema: "evavo.ci-official-action-compatibility-repair.v1",
  compatiblePnpmAction: COMPATIBLE_PNPM_ACTION,
  compatiblePnpmActionRelease: "v6.0.10",
  pinnedPnpmVersion: "10.13.1",
  changedFilesBeforeTemporaryRemoval: changed.length,
  pnpmWorkflowChanges: pnpmWorkflowChanges.length,
  totals,
  files: changed.sort((left, right) => left.path.localeCompare(right.path)),
};

const manifestPath = parseManifestPath();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
