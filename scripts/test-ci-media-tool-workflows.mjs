import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");
const SHARED_BOOTSTRAP = "bash scripts/bootstrap-ci-media-tools.sh";
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
