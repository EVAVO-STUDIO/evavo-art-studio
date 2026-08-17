#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EXPECTED_NODE = "22.14.0";
const EXPECTED_PNPM = "10.13.1";
const EXPECTED_PYTHON = "3.13.5";
const EXPECTED_PILLOW = "12.2.0";
const EXPECTED_LOCKFILE_VERSION = "9.0";
const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const PNPM_SETUP_SHA = "0977fd99725f1db4007ccb2928dbb4e90d06cc86";
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020";
const SETUP_PYTHON_SHA = "5fda3b95a4ea91299a34e894583c3862153e4b97";
const UPLOAD_ARTIFACT_SHA = "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
const AUTOMATIC_VALIDATION_NOTE =
  "Validation runs automatically on pushes to main and may also be manually dispatched for the exact current main SHA.";
const CURRENT_MAIN_RECEIPT_NOTE =
  "Superseded mainline validations are cancelled; a receipt is written only after the candidate is re-proven as current origin/main.";
const FROZEN_LOCK_NOTE =
  "The canonical pnpm lockfile is committed source and every install must use pnpm install --frozen-lockfile.";
const DEPENDENCY_CHANGE_NOTE =
  "Dependency updates require an explicit reviewed pnpm-lock.yaml change generated with Node.js 22.14.0 and pnpm 10.13.1.";
const IMAGE_TOOLCHAIN_NOTE =
  "Raster evidence validation uses Python 3.13.5 and Pillow 12.2.0 exactly; evaluated pixels are decoded from the same retained bytes that are hashed.";

const args = new Set(process.argv.slice(2));
const skipRuntime = args.delete("--skip-runtime");
if (args.size > 0) {
  throw new Error(`ART_STUDIO_TOOLCHAIN_OPTION_UNSUPPORTED:${[...args][0]}`);
}

const root = fs.realpathSync.native(process.cwd());
const errors = [];

const portable = (value) => value.split(path.sep).join("/");

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

const parseJson = (relativePath) => {
  const source = read(relativePath, 16_000_000);
  if (source.startsWith("\uFEFF")) {
    throw new Error(`Art Studio JSON contains a BOM: ${relativePath}`);
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`Art Studio JSON is invalid: ${relativePath}`);
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
    if (match) branches.push(match[1].replace(/^['"]|['"]$/g, ""));
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

const workspaceManifestPaths = () => {
  const result = ["package.json"];
  for (const workspaceRoot of ["apps", "packages"]) {
    const absoluteRoot = resolveInside(workspaceRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    const rootStats = fs.lstatSync(absoluteRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      errors.push(`workspace root must be one real directory: ${workspaceRoot}`);
      continue;
    }
    for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        errors.push(`workspace entry must not be a symlink: ${workspaceRoot}/${entry.name}`);
        continue;
      }
      if (!entry.isDirectory()) continue;
      const relativeManifest = `${workspaceRoot}/${entry.name}/package.json`;
      const absoluteManifest = resolveInside(relativeManifest);
      if (!fs.existsSync(absoluteManifest)) continue;
      const manifestStats = fs.lstatSync(absoluteManifest);
      if (!manifestStats.isFile() || manifestStats.isSymbolicLink()) {
        errors.push(`workspace package manifest must be one real file: ${relativeManifest}`);
        continue;
      }
      result.push(relativeManifest);
    }
  }
  return result.sort();
};

const decodeYamlKey = (raw) => {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const lockfileImporters = (source) => {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf("importers:");
  if (start < 0) return [];
  const importers = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !line.startsWith(" ")) break;
    const match = line.match(/^  ([^ ].*):$/);
    if (match) importers.push(decodeYamlKey(match[1]));
  }
  return [...new Set(importers)].sort();
};

if (read(".nvmrc", 64) !== `${EXPECTED_NODE}\n`) {
  errors.push(`.nvmrc must contain exactly ${EXPECTED_NODE}`);
}
if (read("requirements-image-pipeline.txt", 512) !== `Pillow==${EXPECTED_PILLOW}\n`) {
  errors.push(`requirements-image-pipeline.txt must pin Pillow exactly to ${EXPECTED_PILLOW}`);
}

const packageJsonPaths = workspaceManifestPaths();
const manifests = new Map(
  packageJsonPaths.map((relativePath) => [
    relativePath,
    relativePath === "package.json" ? canonicalJson(relativePath) : parseJson(relativePath),
  ]),
);
const manifest = manifests.get("package.json");
if (
  manifest?.name !== "@evavo/art-studio" ||
  manifest?.private !== true ||
  manifest?.packageManager !== `pnpm@${EXPECTED_PNPM}` ||
  manifest?.engines?.node !== EXPECTED_NODE ||
  manifest?.engines?.pnpm !== EXPECTED_PNPM
) {
  errors.push("package.json exact Art Studio identity or toolchain authority changed");
}
if (JSON.stringify(manifest?.workspaces) !== JSON.stringify(["apps/*", "packages/*"])) {
  errors.push("package.json workspace roots changed");
}
for (const [name, command] of Object.entries({
  "toolchain:check": "node scripts/check-repository-toolchain.mjs",
  "toolchain:check:installed": "node scripts/check-repository-toolchain.mjs",
  "toolchain:test": "node scripts/test-repository-toolchain.mjs",
})) {
  if (manifest?.scripts?.[name] !== command) {
    errors.push(`package.json must expose ${name} as ${command}`);
  }
}
const checkCommand = String(manifest?.scripts?.check ?? "");
if (!checkCommand.startsWith("pnpm run toolchain:check:installed && pnpm run toolchain:test && ")) {
  errors.push("package.json check must begin with committed-lock toolchain and adversarial validation");
}
for (const token of ["pnpm run build:domain", "pnpm typecheck", "pnpm test", "pnpm build"]) {
  if (!checkCommand.includes(token)) errors.push(`package.json check is missing ${token}`);
}

for (const [relativePath, packageManifest] of manifests) {
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = packageManifest?.[section];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [name, rawValue] of Object.entries(dependencies)) {
      const value = String(rawValue);
      if (value.trim().toLowerCase() === "latest") {
        errors.push(`${relativePath} uses the floating latest tag for ${name}`);
      }
      if (/^file:/i.test(value)) {
        errors.push(`${relativePath} uses prohibited file: dependency authority for ${name}`);
      }
      if (/^(?:[A-Za-z]:[\\/]|\/)/.test(value)) {
        errors.push(`${relativePath} uses an absolute local dependency path for ${name}`);
      }
      if (/\$\{[^}]+\}|(?:_authToken|npmAuthToken|NODE_AUTH_TOKEN|NPM_TOKEN|PNPM_TOKEN)/i.test(value)) {
        errors.push(`${relativePath} embeds environment or registry credential material for ${name}`);
      }
    }
  }
}

if (read("pnpm-workspace.yaml", 512) !== 'packages:\n  - "apps/*"\n  - "packages/*"\n') {
  errors.push("pnpm-workspace.yaml workspace roots changed");
}

const lockfile = read("pnpm-lock.yaml", 64_000_000);
if (!new RegExp(`^lockfileVersion:\\s+['\"]?${EXPECTED_LOCKFILE_VERSION.replace(".", "\\.")}['\"]?\\s*$`, "m").test(lockfile)) {
  errors.push(`pnpm-lock.yaml must use lockfileVersion ${EXPECTED_LOCKFILE_VERSION}`);
}
const lockTracked = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", "--", "pnpm-lock.yaml"],
  { cwd: root, encoding: "utf8", timeout: 10_000, windowsHide: true },
);
if (lockTracked.status !== 0) {
  errors.push("pnpm-lock.yaml must be committed and tracked");
}
const expectedImporters = packageJsonPaths
  .map((relativePath) => (relativePath === "package.json" ? "." : portable(path.dirname(relativePath))))
  .sort();
const observedImporters = lockfileImporters(lockfile);
if (JSON.stringify(observedImporters) !== JSON.stringify(expectedImporters)) {
  errors.push(
    `pnpm-lock.yaml importers differ from the exact workspace: expected ${JSON.stringify(expectedImporters)}, observed ${JSON.stringify(observedImporters)}`,
  );
}
for (const [label, pattern] of [
  ["file dependency", /\bfile:/i],
  ["environment interpolation", /\$\{[^}]+\}/],
  ["registry credential", /(?:_authToken|npmAuthToken|NODE_AUTH_TOKEN|NPM_TOKEN|PNPM_TOKEN)/i],
  ["credential-bearing URL", /https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
  ["absolute local path", /(?:^|[\s:'"])(?:[A-Za-z]:[\\/]|\/home\/|\/Users\/|\/private\/tmp\/|\/tmp\/)/m],
]) {
  if (pattern.test(lockfile)) errors.push(`pnpm-lock.yaml contains prohibited ${label}`);
}

const profile = canonicalJson("evavo.reliability.json");
if (
  profile.schemaVersion !== "1.2" ||
  profile.id !== "evavo-art-studio" ||
  profile.repository !== "EVAVO-STUDIO/evavo-art-studio" ||
  profile.defaultBranch !== "main" ||
  profile.stack !== "node-pnpm-creative-workspace" ||
  profile.packageManager?.name !== "pnpm" ||
  profile.packageManager?.exactVersion !== EXPECTED_PNPM ||
  profile.packageManager?.lockfilePolicy !== "committed-frozen" ||
  profile.packageManager?.lockfilePresent !== true ||
  profile.packageManager?.install !== "pnpm install --frozen-lockfile" ||
  profile.runtime?.node !== EXPECTED_NODE ||
  profile.runtime?.pnpm !== EXPECTED_PNPM
) {
  errors.push("evavo.reliability.json Art Studio authority changed");
}
if (
  profile.imageToolchain?.python !== EXPECTED_PYTHON ||
  profile.imageToolchain?.requirements !== "requirements-image-pipeline.txt" ||
  profile.imageToolchain?.pillow !== EXPECTED_PILLOW ||
  profile.imageToolchain?.install !==
    "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt" ||
  profile.imageToolchain?.verification !== "python tools/verify_brass_creative_evaluation.py"
) {
  errors.push("evavo.reliability.json exact image toolchain authority changed");
}
if (
  profile.dependencyLock?.path !== "pnpm-lock.yaml" ||
  profile.dependencyLock?.format !== "pnpm-lockfile-v9" ||
  profile.dependencyLock?.generatedWith?.node !== EXPECTED_NODE ||
  profile.dependencyLock?.generatedWith?.pnpm !== EXPECTED_PNPM ||
  profile.dependencyLock?.committed !== true ||
  profile.dependencyLock?.frozenInstallationRequired !== true ||
  profile.dependencyLock?.immutableDuringValidation !== true
) {
  errors.push("evavo.reliability.json committed lock authority changed");
}
const expectedValidation = [
  "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt",
  "python tools/verify_brass_creative_evaluation.py",
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "pnpm install --frozen-lockfile",
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "pnpm run build:domain",
  "pnpm typecheck",
  "pnpm test",
  "pnpm build",
  'git diff --exit-code -- pnpm-lock.yaml && git diff --exit-code && test -z "$(git status --porcelain)"',
];
if (JSON.stringify(profile.validation) !== JSON.stringify(expectedValidation)) {
  errors.push("evavo.reliability.json frozen validation sequence changed");
}
if (
  profile.executedBaseline?.runId !== "30544861146" ||
  profile.executedBaseline?.headSha !== "52b6f0707f52a8c04e707cb521456f342d881d62" ||
  profile.executedBaseline?.conclusion !== "success" ||
  profile.executedBaseline?.installedWithoutCommittedLockfile !== true
) {
  errors.push("historical review-first baseline evidence changed");
}
for (const note of [
  AUTOMATIC_VALIDATION_NOTE,
  CURRENT_MAIN_RECEIPT_NOTE,
  FROZEN_LOCK_NOTE,
  DEPENDENCY_CHANGE_NOTE,
  IMAGE_TOOLCHAIN_NOTE,
]) {
  if (!profile.notes?.includes(note)) errors.push(`reliability profile is missing note: ${note}`);
}
for (const staleNote of [
  "A committed pnpm lockfile requires a separate generated, reviewed and fully validated change before frozen installation can be activated.",
  "The generated review-first lockfile is temporary installed state, must remain untracked and is removed before CI completes.",
]) {
  if (profile.notes?.includes(staleNote)) errors.push(`reliability profile retains stale note: ${staleNote}`);
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
  schema.properties?.schemaVersion?.const !== "1.2" ||
  schema.properties?.id?.const !== "evavo-art-studio" ||
  schema.properties?.stack?.const !== "node-pnpm-creative-workspace" ||
  schema.properties?.packageManager?.properties?.lockfilePolicy?.const !== "committed-frozen" ||
  schema.properties?.packageManager?.properties?.lockfilePresent?.const !== true ||
  schema.properties?.packageManager?.properties?.install?.const !== "pnpm install --frozen-lockfile" ||
  schema.properties?.dependencyLock?.properties?.committed?.const !== true ||
  schema.properties?.dependencyLock?.properties?.frozenInstallationRequired?.const !== true ||
  schema.properties?.imageToolchain?.properties?.python?.const !== EXPECTED_PYTHON ||
  schema.properties?.imageToolchain?.properties?.requirements?.const !== "requirements-image-pipeline.txt" ||
  schema.properties?.imageToolchain?.properties?.pillow?.const !== EXPECTED_PILLOW ||
  schema.properties?.imageToolchain?.properties?.install?.const !==
    "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt" ||
  schema.properties?.imageToolchain?.properties?.verification?.const !==
    "python tools/verify_brass_creative_evaluation.py" ||
  !schema.required?.includes("dependencyLock") ||
  !schema.required?.includes("imageToolchain")
) {
  errors.push("repository-owned reliability schema frozen-lock or image-toolchain authority changed");
}

const workflowDirectory = resolveInside(".github/workflows");
const workflowPaths = fs
  .readdirSync(workflowDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
  .map((entry) => `.github/workflows/${entry.name}`)
  .sort();
for (const relativePath of workflowPaths) {
  const source = read(relativePath, 2_000_000);
  for (const forbidden of ["--no-frozen-lockfile", "rm -f pnpm-lock.yaml", "rm -f ./pnpm-lock.yaml"]) {
    if (source.includes(forbidden)) errors.push(`${relativePath} contains obsolete lock handling: ${forbidden}`);
  }
  for (const line of source.split(/\r?\n/)) {
    if (/\bpnpm\b.*\binstall\b/.test(line) && !line.includes("--frozen-lockfile")) {
      errors.push(`${relativePath} contains a non-frozen pnpm install: ${line.trim()}`);
    }
  }
}

const workflow = read(".github/workflows/ci.yml");
const events = workflowEvents(workflow);
if (JSON.stringify(events) !== JSON.stringify(["push", "workflow_dispatch"])) {
  errors.push(`CI workflow must use only main push and workflow_dispatch; found ${JSON.stringify(events)}`);
}
const pushBranches = workflowPushBranches(workflow);
if (JSON.stringify(pushBranches) !== JSON.stringify(["main"])) {
  errors.push(`CI push validation must target exactly main; found ${JSON.stringify(pushBranches)}`);
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
  `actions/checkout@${CHECKOUT_SHA} # v7.0.1`,
  "ref: ${{ env.ART_STUDIO_EXPECTED_SHA }}",
  "fetch-depth: 0",
  "persist-credentials: false",
  "git show-ref --verify --quiet refs/remotes/origin/main",
  '[[ "$(git rev-parse refs/remotes/origin/main)" == "${ART_STUDIO_EXPECTED_SHA}" ]]',
  `actions/setup-python@${SETUP_PYTHON_SHA} # v7.0.0`,
  `python-version: "${EXPECTED_PYTHON}"`,
  "cache-dependency-path: requirements-image-pipeline.txt",
  "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt",
  '[[ "${PYTHON_VERSION}" == "' + EXPECTED_PYTHON + '" ]]',
  '[[ "${PILLOW_VERSION}" == "' + EXPECTED_PILLOW + '" ]]',
  "ART_STUDIO_PYTHON_VERSION",
  "ART_STUDIO_PILLOW_VERSION",
  "python -m py_compile",
  "tools/brass_creative_evaluation.py",
  "tools/evaluate_brass_creative_candidate.py",
  "tools/evaluate_brass_animation_sequence.py",
  "tools/verify_brass_creative_evaluation.py",
  "python tools/verify_brass_creative_evaluation.py",
  `pnpm/action-setup@${PNPM_SETUP_SHA} # v6.0.10`,
  `actions/setup-node@${SETUP_NODE_SHA} # v7.0.0`,
  `node-version: "${EXPECTED_NODE}"`,
  `version: ${EXPECTED_PNPM}`,
  "package-manager-cache: false",
  "git ls-files --error-unmatch -- pnpm-lock.yaml",
  "ART_STUDIO_LOCKFILE_SHA256",
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "pnpm install --frozen-lockfile",
  "pnpm check",
  '[[ "$(sha256sum pnpm-lock.yaml | awk \'{print $1}\')" == "${ART_STUDIO_LOCKFILE_SHA256}" ]]',
  "git diff --exit-code -- pnpm-lock.yaml",
  "git diff --exit-code",
  'test -z "$(git status --porcelain)"',
  "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main",
  "Candidate was superseded before receipt creation",
  '"schemaVersion": "1.3"',
  '"trigger": process.env.GITHUB_EVENT_NAME',
  '"requestSource": process.env.ART_STUDIO_REQUEST_SOURCE',
  '"currentMainAtReceipt": true',
  '"python": process.env.ART_STUDIO_PYTHON_VERSION',
  '"pillow": process.env.ART_STUDIO_PILLOW_VERSION',
  '"descriptorBoundSourceReads": true',
  '"decodedPixelsFromRetainedSourceBytes": true',
  '"singleFrameSourcesOnly": true',
  '"atomicCreateOnlyPublication": true',
  '"publishedEvidenceByteVerification": true',
  '"lockfilePolicy": "committed-frozen"',
  '"lockfileSha256": process.env.ART_STUDIO_LOCKFILE_SHA256',
  '"installedWithoutCommittedLockfile": false',
  '"deployment": "disabled"',
  `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA} # v7.0.1`,
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
  "actions/setup-python@v",
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
  "pnpm install --no-frozen-lockfile",
  "pnpm install --force",
  "rm -f pnpm-lock.yaml",
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
  `actions/setup-python@${SETUP_PYTHON_SHA}`,
  "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt",
  "python tools/verify_brass_creative_evaluation.py",
  "git ls-files --error-unmatch -- pnpm-lock.yaml",
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "pnpm install --frozen-lockfile",
  "pnpm check",
  "git diff --exit-code -- pnpm-lock.yaml",
  "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main",
  '"currentMainAtReceipt": true',
  `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`,
];
let previousIndex = -1;
for (const token of orderedWorkflowTokens) {
  const index = workflow.indexOf(token);
  if (index < 0 || index <= previousIndex) errors.push(`CI workflow step order is invalid at ${token}`);
  previousIndex = index;
}
for (const action of workflowActions(workflow)) {
  const at = action.lastIndexOf("@");
  const reference = at >= 0 ? action.slice(at + 1) : "";
  if (!/^[a-f0-9]{40}$/i.test(reference)) {
    errors.push(`CI action must use a full 40-character commit SHA: ${action}`);
  }
}

const toolchainWorkflow = read(".github/workflows/repository-toolchain-authority.yml");
const toolchainEvents = workflowEvents(toolchainWorkflow);
if (JSON.stringify(toolchainEvents) !== JSON.stringify(["pull_request", "workflow_dispatch"])) {
  errors.push(
    `repository toolchain workflow must use only pull_request and workflow_dispatch; found ${JSON.stringify(toolchainEvents)}`,
  );
}
for (const token of [
  "name: Repository toolchain authority",
  '      - ".nvmrc"',
  '      - "package.json"',
  '      - "pnpm-lock.yaml"',
  '      - "requirements-image-pipeline.txt"',
  '      - "evavo.reliability.json"',
  '      - "schemas/repository-owned-reliability-profile.schema.json"',
  '      - "scripts/check-repository-toolchain.mjs"',
  '      - "scripts/test-repository-toolchain.mjs"',
  '      - ".github/workflows/ci.yml"',
  '      - ".github/workflows/repository-toolchain-authority.yml"',
  "permissions:\n  contents: read",
  "cancel-in-progress: true",
  "runs-on: ubuntu-24.04",
  `actions/checkout@${CHECKOUT_SHA} # v7.0.1`,
  "fetch-depth: 1",
  "persist-credentials: false",
  `pnpm/action-setup@${PNPM_SETUP_SHA} # v6.0.10`,
  `version: ${EXPECTED_PNPM}`,
  `actions/setup-node@${SETUP_NODE_SHA} # v7.0.0`,
  `node-version: "${EXPECTED_NODE}"`,
  "package-manager-cache: false",
  "node scripts/check-repository-toolchain.mjs",
  "node scripts/test-repository-toolchain.mjs",
  "git diff --exit-code",
  'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
]) {
  if (!toolchainWorkflow.includes(token)) {
    errors.push(`repository toolchain workflow is missing: ${token}`);
  }
}
for (const forbidden of [
  "  push:",
  "schedule:",
  "repository_dispatch:",
  "workflow_run:",
  "ubuntu-latest",
  "persist-credentials: true",
  "contents: write",
  "write-all",
  "secrets.",
  "GITHUB_TOKEN",
  "pnpm install",
  "git push",
  "git clean -",
  "git reset --hard",
]) {
  if (toolchainWorkflow.includes(forbidden)) {
    errors.push(`repository toolchain workflow contains prohibited material: ${forbidden}`);
  }
}
for (const action of workflowActions(toolchainWorkflow)) {
  const at = action.lastIndexOf("@");
  const reference = at >= 0 ? action.slice(at + 1) : "";
  if (!/^[a-f0-9]{40}$/i.test(reference)) {
    errors.push(`repository toolchain action must use a full 40-character commit SHA: ${action}`);
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
console.log(`- Node.js ${EXPECTED_NODE}, pnpm ${EXPECTED_PNPM}, Python ${EXPECTED_PYTHON}, Pillow ${EXPECTED_PILLOW} and lockfile v${EXPECTED_LOCKFILE_VERSION} are exact authorities`);
console.log(`- pnpm-lock.yaml covers ${expectedImporters.length} exact workspace importers and is committed`);
console.log("- every permanent workflow uses frozen installation and preserves lockfile identity");
console.log("- CI validates only exact current main and records lock, image-runtime and Brass exact-byte evidence");
console.log("- validation and production-effect authority remain separate");
