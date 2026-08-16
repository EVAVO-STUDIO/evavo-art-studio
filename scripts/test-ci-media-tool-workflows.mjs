import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");
const SHARED_BOOTSTRAP = "bash scripts/bootstrap-ci-media-tools.sh";
const PINNED_PYTHON_ACTION =
  "actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405";
const PINNED_IMAGE_BACKEND =
  "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt";
const FORBIDDEN_PATTERNS = [
  /sudo\s+apt-get\s+update/,
  /apt-get\s+install[^\n]*\bffmpeg\b/,
];

async function workflowSources() {
  const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true });
  const paths = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .map((entry) => path.join(WORKFLOW_ROOT, entry.name))
    .sort();
  return Promise.all(
    paths.map(async (workflowPath) => ({
      path: path.relative(ROOT, workflowPath).replaceAll(path.sep, "/"),
      source: await readFile(workflowPath, "utf8"),
    })),
  );
}

test("workflows never perform unbounded apt or direct FFmpeg installation", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(workflow.source)) {
        violations.push(`${workflow.path}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Unbounded workflow media installation remains:\n${violations.join("\n")}`,
  );
});

test("critical media workflows use the shared bounded bootstrap", async () => {
  const required = new Set([
    ".github/workflows/artifact-descriptor-integrity.yml",
    ".github/workflows/artifact-json-canonicalization.yml",
    ".github/workflows/artifact-reference-integrity.yml",
    ".github/workflows/book-art-docs-release.yml",
    ".github/workflows/book-art-provider-runtime.yml",
    ".github/workflows/book-creative-direction.yml",
    ".github/workflows/book-illustration-intelligence.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/provider-control-capabilities.yml",
    ".github/workflows/runtime-journal-integrity.yml",
    ".github/workflows/runtime-submission-integrity.yml",
    ".github/workflows/runtime-worker-options-integrity.yml",
    ".github/workflows/sprite-motion-topology.yml",
  ]);
  const sources = new Map(
    (await workflowSources()).map((workflow) => [workflow.path, workflow.source]),
  );
  const missing = [];
  for (const workflowPath of [...required].sort()) {
    const source = sources.get(workflowPath);
    if (source === undefined || !source.includes(SHARED_BOOTSTRAP)) {
      missing.push(workflowPath);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Critical workflows missing shared media bootstrap:\n${missing.join("\n")}`,
  );
});

test("complete-validation workflows install the exact Python image backend", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    const validationIndex = workflow.source.indexOf("pnpm check");
    if (validationIndex < 0) continue;
    const setupIndex = workflow.source.indexOf(PINNED_PYTHON_ACTION);
    const installIndex = workflow.source.indexOf(PINNED_IMAGE_BACKEND);
    if (
      setupIndex < 0 ||
      installIndex < 0 ||
      setupIndex > validationIndex ||
      installIndex > validationIndex
    ) {
      violations.push(workflow.path);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Complete-validation workflows missing the exact Python image backend:\n${violations.join("\n")}`,
  );
});
