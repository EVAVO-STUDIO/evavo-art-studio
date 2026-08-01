#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EXPECTED_NODE = "22.14.0";
const EXPECTED_PNPM = "10.13.1";
const CHECKOUT_SHA = "de0fac2e4500dabe0009e67214ff5f5447ce83dd";
const PNPM_SETUP_SHA = "fc06bc1257f339d1d5d8b3a19a8cae5388b55320";
const SETUP_NODE_SHA = "6044e13b5dc448c55e2357c09f80417699197238";
const UPLOAD_ARTIFACT_SHA = "ea165f8d65b6e75b540449e92b4886f43607fa02";
const AUTOMATIC_VALIDATION_NOTE =
  "Validation runs automatically on pushes to main and may also be manually dispatched for the exact current main SHA.";
const CURRENT_MAIN_RECEIPT_NOTE =
  "Superseded mainline validations are cancelled; a receipt is written only after the candidate is re-proven as current origin/main.";

const args = new Set(process.argv.slice(2));
const allowGeneratedLockfile = args.delete("--allow-generated-lockfile");
const skipRuntime = args.delete("--skip-runtime");
if (args.size > 0) {
  throw new Error(`ART_STUDIO_TOOLCHAIN_OPTION_UNSUPPORTED:${[...args][0]}`);
}

const root = fs.realpathSync.native(process.cwd());
const errors = [];

const resolveInside = (relativePath) => {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`ART_STUDIO_TOOLCHAIN_PATH_INVALID:${relativePath}`);
  }
  const absolutePath = path.resolve(root, relativePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`ART_STUDIO_TOOLCHAIN_PATH_ESCAPE:${relativePath}`);
  }
  return absolutePath;
};

const read = (relativePath, maximumBytes = 4_000_000) => {
  const absolutePath = resolveInside(relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing Art Studio toolchain file: ${relativePath}`);
  }
  const stats = fs.lstatSync(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Art Studio toolchain path must be a regular file: ${relativePath}`);
  }
  if (stats.size > maximumBytes) {
    throw new Error(`Art Studio toolchain file is too large: ${relativePath}`);
  }
  const bytes = fs.readFileSync(absolutePath);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`Art Studio toolchain file is not valid UTF-8: ${relativePath}`);
  }
};

const canonicalJson = (relativePath) => {
  const source = read(relativePath, 16_000_000);
  if (source.startsWith("\uFEFF")) {
    throw new Error(`Art Studio JSON contains a BOM: ${relativePath}`);
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`Art Studio JSON is invalid: ${relativePath}`);
  }
  if (source !== `${JSON.stringify(value, null, 2)}\n`) {
    throw new Error(`Art Studio JSON is not canonical: ${relativePath}`);
  }
  return value;
};

const workflowEvents = (source) => {
  const lines = source.split(/\r?\n/);
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === "on:") starts.push(index);
  }
  if (starts.length !== 1) return [];
  const events = [];
  for (let index = starts[0] + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !/^\s/.test(line)) break;
    const match = line.match(/^  ([A-Za-z_][A-Za-z0-9_-]*):/);
    if (match) events.push(match[1]);
  }
  return [...new Set(events)].sort();
};

const workflowPushBranches = (source) => {
  const lines = source.split(/\r?\n/);
  const pushIndex = lines.indexOf("  push:");
  if (pushIndex < 0) return [];
  let branchesIndex = -1;
  for (let index = pushIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  [A-Za-z_][A-Za-z0-9_-]*:/.test(line)) break;
    if (line === "    branches:") {
      branchesIndex = index;
      break;
    }
  }
  if (branchesIndex < 0) return [];
  const branches = [];
  for (let index = branchesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  [A-Za-z_][A-Za-z0-9_-]*:/.test(line)) break;
    if (/^    [A-Za-z_][A-Za-z0-9_-]*:/.test(line)) break;
    const match = line.match(/^      -\s+(.+?)\s*$/);
    if (match) {
      branches.push(match[1].replace(/^['"]|['"]$/g, ""));
    }
  }
  return branches;
};

const workflowActions = (source) => {
  const actions = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*uses:\s*([^\s#]+)\s*/);
    if (match) actions.push(match[1].replace(/^['"]|['"]$/g, ""));
  }
  return actions;
};

if (read(".nvmrc", 64) !== `${EXPECTED_NODE}\n`) {
  errors.push(`.nvmrc must contain exactly ${EXPECTED_NODE}`);
}

const manifest = canonicalJson("package.json");
if (
  manifest.name !== "@evavo/art-studio" ||
  manifest.private !== true ||
  manifest.packageManager !== `pnpm@${EXPECTED_PNPM}` ||
  manifest.engines?.node !== EXPECTED_NODE ||
  manifest.engines?.pnpm !== EXPECTED_PNPM
) {
  errors.push("package.json exact Art Studio identity or toolchain authority changed");
}
if (JSON.stringify(manifest.workspaces) !== JSON.stringify(["apps/*", "packages/*"])) {
  errors.push("package.json workspace roots changed");
}
for (const [name, command] of Object.entries({
  "toolchain:check": "node scripts/check-repository-toolchain.mjs",
  "toolchain:check:installed":
    "node scripts/check-repository-toolchain.mjs --allow-generated-lockfile",
  "toolchain:test": "node scripts/test-repository-toolchain.mjs",
})) {
  if (manifest.scripts?.[name] !== command) {
    errors.push(`package.json must expose ${name} as ${command}`);
  }
}
const checkCommand = String(manifest.scripts?.check ?? "");
if (
  !checkCommand.startsWith(
    "pnpm run toolchain:check:installed && pnpm run toolchain:test && ",
  )
) {
  errors.push(
    "package.json check must begin with installed-state toolchain and adversarial validation",
  );
}
for (const token of ["pnpm run build:domain", "pnpm typecheck", "pnpm test", "pnpm build"]) {
  if (!checkCommand.includes(token)) errors.push(`package.json check is missing ${token}`);
}

if (read("pnpm-workspace.yaml", 512) !== 'packages:\n  - "apps/*"\n  - "packages/*"\n') {
  errors.push("pnpm-workspace.yaml workspace roots changed");
}

const lockfilePath = resolveInside("pnpm-lock.yaml");
if (fs.existsSync(lockfilePath)) {
  if (!allowGeneratedLockfile) {
    errors.push(
      "pnpm-lock.yaml appeared before the review-first lockfile transition was approved",
    );
  } else {
    const generatedLockfile = read("pnpm-lock.yaml", 64_000_000);
    if (!generatedLockfile.includes("lockfileVersion:")) {
      errors.push("generated pnpm-lock.yaml does not contain a lockfile version");
    }
    const tracked = spawnSync(
      "git",
      ["ls-files", "--error-unmatch", "--", "pnpm-lock.yaml"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      },
    );
    if (tracked.status === 0) {
      errors.push(
        "pnpm-lock.yaml is tracked before the review-first lockfile transition was approved",
      );
    }
  }
}

const profile = canonicalJson("evavo.reliability.json");
if (
  profile.schemaVersion !== "1.0" ||
  profile.id !== "evavo-art-studio" ||
  profile.repository !== "EVAVO-STUDIO/evavo-art-studio" ||
  profile.defaultBranch !== "main" ||
  profile.stack !== "node-pnpm-creative-workspace" ||
  profile.packageManager?.name !== "pnpm" ||
  profile.packageManager?.exactVersion !== EXPECTED_PNPM ||
  profile.packageManager?.lockfilePolicy !== "review-first" ||
  profile.packageManager?.lockfilePresent !== false ||
  profile.runtime?.node !== EXPECTED_NODE ||
  profile.runtime?.pnpm !== EXPECTED_PNPM
) {
  errors.push("evavo.reliability.json Art Studio authority changed");
}
if (
  profile.executedBaseline?.runId !== "30544861146" ||
  profile.executedBaseline?.headSha !== "52b6f0707f52a8c04e707cb521456f342d881d62" ||
  profile.executedBaseline?.conclusion !== "success" ||
  profile.executedBaseline?.installedWithoutCommittedLockfile !== true
) {
  errors.push("executed baseline evidence changed");
}
if (!profile.notes?.includes(AUTOMATIC_VALIDATION_NOTE)) {
  errors.push("reliability profile is missing the automatic exact-main validation note");
}
if (!profile.notes?.includes(CURRENT_MAIN_RECEIPT_NOTE)) {
  errors.push("reliability profile is missing the current-main receipt note");
}
for (const prohibited of [
  "live provider requests",
  "artifact promotion",
  "named reference mutation",
  "production deployment",
  "credential mutation",
  "external communication",
]) {
  if (!profile.capabilityBoundary?.validationDoesNotAuthorize?.includes(prohibited)) {
    errors.push(`capability boundary is missing: ${prohibited}`);
  }
}

const schema = canonicalJson("schemas/repository-owned-reliability-profile.schema.json");
if (
  schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
  schema.properties?.id?.const !== "evavo-art-studio" ||
  schema.properties?.stack?.const !== "node-pnpm-creative-workspace"
) {
  errors.push("repository-owned reliability schema identity changed");
}

const workflow = read(".github/workflows/ci.yml");
const events = workflowEvents(workflow);
if (JSON.stringify(events) !== JSON.stringify(["push", "workflow_dispatch"])) {
  errors.push(
    `CI workflow must use only main push and workflow_dispatch; found ${JSON.stringify(events)}`,
  );
}
const pushBranches = workflowPushBranches(workflow);
if (JSON.stringify(pushBranches) !== JSON.stringify(["main"])) {
  errors.push(
    `CI push validation must target exactly main; found ${JSON.stringify(pushBranches)}`,
  );
}

const requiredWorkflowTokens = [
  "name: Art Studio exact mainline validation",
  "on:\n  push:\n    branches:\n      - main\n  workflow_dispatch:",
  "expected_sha:",
  "request_source:",
  "default: evavo-development-studio",
  "permissions:\n  contents: read",
  "group: art-studio-ci-main",
  "cancel-in-progress: true",
  "runs-on: ubuntu-24.04",
  "ART_STUDIO_EXPECTED_SHA: ${{ github.event_name == 'workflow_dispatch' && inputs.expected_sha || github.sha }}",
  "ART_STUDIO_REQUEST_SOURCE: ${{ github.event_name == 'workflow_dispatch' && inputs.request_source || 'github-main-push' }}",
  '[[ "${GITHUB_REF}" == "refs/heads/main" ]]',
  '[[ "${ART_STUDIO_EXPECTED_SHA}" == "${GITHUB_SHA}" ]]',
  '[[ "${GITHUB_EVENT_NAME}" == "workflow_dispatch" ]]',
  '[[ "${ART_STUDIO_REQUEST_SOURCE}" == "evavo-development-studio" ]]',
  '[[ "${GITHUB_EVENT_NAME}" == "push" ]]',
  '[[ "${ART_STUDIO_REQUEST_SOURCE}" == "github-main-push" ]]',
  `actions/checkout@${CHECKOUT_SHA} # v6.0.2`,
  "ref: ${{ env.ART_STUDIO_EXPECTED_SHA }}",
  "fetch-depth: 0",
  "persist-credentials: false",
  "git show-ref --verify --quiet refs/remotes/origin/main",
  '[[ "$(git rev-parse refs/remotes/origin/main)" == "${ART_STUDIO_EXPECTED_SHA}" ]]',
  `pnpm/action-setup@${PNPM_SETUP_SHA} # v4.4.0`,
  `actions/setup-node@${SETUP_NODE_SHA} # v6.2.0`,
  `node-version: "${EXPECTED_NODE}"`,
  `version: ${EXPECTED_PNPM}`,
  "package-manager-cache: false",
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "pnpm install --no-frozen-lockfile",
  "pnpm check",
  "rm -f pnpm-lock.yaml",
  "git diff --exit-code",
  'test -z "$(git status --porcelain)"',
  "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main",
  "Candidate was superseded before receipt creation",
  '"schemaVersion": "1.1"',
  '"trigger": process.env.GITHUB_EVENT_NAME',
  '"requestSource": process.env.ART_STUDIO_REQUEST_SOURCE',
  '"currentMainAtReceipt": true',
  '"installedWithoutCommittedLockfile": true',
  '"deployment": "disabled"',
  `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA} # v4.6.2`,
  "retention-days: 14",
];
for (const token of requiredWorkflowTokens) {
  if (!workflow.includes(token)) errors.push(`CI workflow is missing: ${token}`);
}

for (const forbidden of [
  "pull_request:",
  "schedule:",
  "workflow_run:",
  "repository_dispatch:",
  "branches-ignore:",
  "cancel-in-progress: false",
  "ubuntu-latest",
  "actions/checkout@v",
  "actions/setup-node@v",
  "actions/upload-artifact@v",
  "pnpm/action-setup@v",
  "persist-credentials: true",
  "contents: write",
  "permissions: write-all",
  "statuses: write",
  "checks: write",
  "actions: write",
  "deployments: write",
  "id-token: write",
  "packages: write",
  "secrets.",
  "GITHUB_TOKEN",
  "Authorization: Bearer",
  "pnpm install --frozen-lockfile",
  "pnpm install --force",
  "git push",
  "git reset --hard",
  "git clean -",
  "npm publish",
  "pnpm publish",
  "vercel deploy",
  "wrangler deploy",
  "gh release create",
]) {
  if (workflow.includes(forbidden)) errors.push(`CI workflow contains prohibited material: ${forbidden}`);
}

const orderedWorkflowTokens = [
  '[[ "${GITHUB_EVENT_NAME}" == "push" ]]',
  `actions/checkout@${CHECKOUT_SHA}`,
  '[[ "$(git rev-parse refs/remotes/origin/main)" == "${ART_STUDIO_EXPECTED_SHA}" ]]',
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "pnpm install --no-frozen-lockfile",
  "pnpm check",
  "rm -f pnpm-lock.yaml",
  "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main",
  '"currentMainAtReceipt": true',
  `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`,
];
let previousIndex = -1;
for (const token of orderedWorkflowTokens) {
  const index = workflow.indexOf(token);
  if (index < 0 || index <= previousIndex) {
    errors.push(`CI workflow step order is invalid at ${token}`);
  }
  previousIndex = index;
}

for (const action of workflowActions(workflow)) {
  const at = action.lastIndexOf("@");
  const reference = at >= 0 ? action.slice(at + 1) : "";
  if (!/^[a-f0-9]{40}$/i.test(reference)) {
    errors.push(`CI action must use a full 40-character commit SHA: ${action}`);
  }
}

if (!skipRuntime) {
  if (process.versions.node !== EXPECTED_NODE) {
    errors.push(`Node.js runtime must be ${EXPECTED_NODE}; observed ${process.versions.node}`);
  }
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  const observedPnpm = result.status === 0 ? result.stdout.trim() : "unavailable";
  if (observedPnpm !== EXPECTED_PNPM) {
    errors.push(`pnpm runtime must be ${EXPECTED_PNPM}; observed ${observedPnpm}`);
  }
}

if (errors.length > 0) {
  console.error("Art Studio repository toolchain check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Art Studio repository toolchain check passed.");
console.log(`- Node.js ${EXPECTED_NODE} and pnpm ${EXPECTED_PNPM} are exact authorities`);
console.log(
  allowGeneratedLockfile
    ? "- the generated review-first lockfile is accepted only as untracked installed state"
    : "- the pre-install source tree contains no unreviewed lockfile",
);
console.log("- CI validates only exact current main, automatically or by governed replay");
console.log("- validation order, current-main receipt proof and capability boundaries agree");
