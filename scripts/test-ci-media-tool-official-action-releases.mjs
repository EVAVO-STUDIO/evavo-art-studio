import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const APPROVED_ACTIONS = new Map([
  [
    "actions/cache",
    "actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  ],
  [
    "actions/checkout",
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  ],
  [
    "actions/download-artifact",
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  ],
  [
    "actions/setup-node",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  ],
  [
    "actions/setup-python",
    "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97",
  ],
  [
    "actions/upload-artifact",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  ],
  [
    "pnpm/action-setup",
    "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86",
  ],
]);

const REPLACED_ACTIONS = new Map([
  [
    "pnpm/setup",
    "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86",
  ],
]);

async function workflowSources() {
  const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true });
  const workflowPaths = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .map((entry) => path.join(WORKFLOW_ROOT, entry.name))
    .sort();

  return Promise.all(
    workflowPaths.map(async (workflowPath) => ({
      path: path.relative(ROOT, workflowPath).replaceAll(path.sep, "/"),
      source: await readFile(workflowPath, "utf8"),
    })),
  );
}

function actionReferences(source) {
  const references = [];
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(.+)$/u);
    if (!match) continue;

    const raw = match[1].trim();
    const commentIndex = raw.search(/\s+#/u);
    let reference = (commentIndex >= 0 ? raw.slice(0, commentIndex) : raw).trim();
    if (
      reference.length >= 2 &&
      ((reference.startsWith('"') && reference.endsWith('"')) ||
        (reference.startsWith("'") && reference.endsWith("'")))
    ) {
      reference = reference.slice(1, -1);
    }
    references.push(reference);
  }
  return references;
}

function actionFamily(reference) {
  const separator = reference.lastIndexOf("@");
  return separator > 0 ? reference.slice(0, separator) : reference;
}

function groupedViolationLines(violations) {
  return [...violations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([message, paths]) => {
      const locations = [...paths].sort().join(", ");
      return `${message}\n  ${locations}`;
    });
}

test("official workflow actions use the current governed releases", async () => {
  const violations = new Map();

  function report(message, workflowPath) {
    const paths = violations.get(message) ?? new Set();
    paths.add(workflowPath);
    violations.set(message, paths);
  }

  for (const workflow of await workflowSources()) {
    for (const reference of actionReferences(workflow.source)) {
      if (reference.startsWith("./") || reference.startsWith("docker://")) {
        continue;
      }

      const family = actionFamily(reference);
      if (!family.startsWith("actions/") && !family.startsWith("pnpm/")) {
        continue;
      }

      const replacement = REPLACED_ACTIONS.get(family);
      if (replacement) {
        report(`${reference} is replaced by ${replacement}`, workflow.path);
        continue;
      }

      const approved = APPROVED_ACTIONS.get(family);
      if (!approved) {
        report(
          `${reference} belongs to an unreviewed official action family`,
          workflow.path,
        );
        continue;
      }

      if (reference !== approved) {
        report(`${reference} must be ${approved}`, workflow.path);
      }
    }
  }

  const lines = groupedViolationLines(violations);
  assert.deepEqual(
    lines,
    [],
    `Official workflow actions are not on current governed releases:\n${lines.join("\n")}`,
  );
});
