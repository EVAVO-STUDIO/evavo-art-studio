import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");
const FULL_VALIDATION_TEST = path.join(
  ROOT,
  "scripts/test-ci-media-tool-workflows.mjs",
);
const PREVIOUS_SETUP_PYTHON_ACTION =
  "actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405";
const CURRENT_SETUP_PYTHON_ACTION =
  "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97";

const RULES = [
  {
    family: "actions/cache",
    replacement:
      "actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0",
  },
  {
    family: "actions/checkout",
    replacement:
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  },
  {
    family: "actions/download-artifact",
    replacement:
      "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1",
  },
  {
    family: "actions/setup-node",
    replacement:
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
  },
  {
    family: "actions/setup-python",
    replacement:
      "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0",
  },
  {
    family: "actions/upload-artifact",
    replacement:
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
  },
  {
    family: "pnpm/action-setup",
    replacement:
      "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2 # v2.0.2",
  },
];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function rewriteWorkflow(source) {
  let rewritten = source;
  const counts = {};

  for (const rule of RULES) {
    const pattern = new RegExp(
      `(^\\s*(?:-\\s*)?uses:\\s*)["']?${escapeRegExp(rule.family)}@[0-9a-f]{40}["']?(?:\\s+#.*)?$`,
      "gmu",
    );
    let count = 0;
    rewritten = rewritten.replace(pattern, (_match, prefix) => {
      count += 1;
      return `${prefix}${rule.replacement}`;
    });
    if (count > 0) counts[rule.family] = count;
  }

  return { rewritten, counts };
}

function parseManifestPath() {
  const index = process.argv.indexOf("--manifest");
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error("--manifest requires a path");
  return path.resolve(value);
}

function addChangedFile(changed, totals, filePath, before, after, replacements) {
  if (after === before) return;
  for (const [family, count] of Object.entries(replacements)) {
    totals[family] = (totals[family] ?? 0) + count;
  }
  changed.push({
    path: path.relative(ROOT, filePath).replaceAll(path.sep, "/"),
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
    replacements,
  });
}

const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true });
const workflowPaths = entries
  .filter(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
  )
  .map((entry) => path.join(WORKFLOW_ROOT, entry.name))
  .sort();

const changed = [];
const totals = {};
for (const workflowPath of workflowPaths) {
  const before = await readFile(workflowPath, "utf8");
  const { rewritten: after, counts } = rewriteWorkflow(before);
  if (after === before) continue;

  await writeFile(workflowPath, after, "utf8");
  addChangedFile(changed, totals, workflowPath, before, after, counts);
}

const validationBefore = await readFile(FULL_VALIDATION_TEST, "utf8");
const validationOccurrences = validationBefore.split(PREVIOUS_SETUP_PYTHON_ACTION).length - 1;
if (validationOccurrences !== 1) {
  throw new Error(
    `Expected exactly one previous setup-python authority in ${path.relative(ROOT, FULL_VALIDATION_TEST)}, found ${validationOccurrences}`,
  );
}
const validationAfter = validationBefore.replace(
  PREVIOUS_SETUP_PYTHON_ACTION,
  CURRENT_SETUP_PYTHON_ACTION,
);
await writeFile(FULL_VALIDATION_TEST, validationAfter, "utf8");
addChangedFile(
  changed,
  totals,
  FULL_VALIDATION_TEST,
  validationBefore,
  validationAfter,
  { "governed-test-setup-python": 1 },
);

if (changed.length === 0) {
  throw new Error("No governed action identities required rewriting");
}

const manifest = {
  schema: "evavo.ci-official-action-rewrite.v1",
  changedFiles: changed.length,
  totals,
  files: changed,
};
const manifestPath = parseManifestPath();
if (manifestPath) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
