import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");
const SHARED_BOOTSTRAP = "bash scripts/bootstrap-ci-media-tools.sh";
const PINNED_PYTHON_ACTION =
  "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97";
const PINNED_IMAGE_BACKEND =
  "python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt";
const FORBIDDEN_PATTERNS = [
  /sudo\s+apt-get\s+update/,
  /apt-get\s+install[^\n]*\bffmpeg\b/,
];
const FLOATING_HOSTED_RUNNER = /\b(?:ubuntu|windows|macos)-latest\b/gu;
const IMMUTABLE_EXTERNAL_ACTION =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/u;
const IMMUTABLE_DOCKER_ACTION =
  /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/u;
const EXACT_PATCH_VERSION = /^\d+\.\d+\.\d+$/u;
const DISABLED_CHECKOUT_CREDENTIALS =
  /\bpersist-credentials:\s*["']?false["']?(?=[ \t]*(?:[,}#]|$))/mu;
const ENABLED_CHECKOUT_CREDENTIALS =
  /\bpersist-credentials:\s*["']?true["']?(?=[ \t]*(?:[,}#]|$))/mu;
const PERSISTED_CHECKOUT_ALLOWLIST = new Map([
  [
    ".github/workflows/finalize-pixel-typography-review.yml",
    [
      "permissions:\n  contents: write",
      "git push origin HEAD:main",
      "persist-credentials: true",
    ],
  ],
  [
    ".github/workflows/pixel-font-repository-publish.yml",
    [
      "TARGET_TOKEN: ${{ secrets.repository_token || secrets.EVAVO_PIXEL_FONT_REPOSITORY_TOKEN }}",
      "--confirm-publish",
      "persist-credentials: true",
    ],
  ],
  [
    ".github/workflows/repair-pixel-typography-review.yml",
    [
      "permissions:\n  contents: write",
      "git push origin HEAD:main",
      "persist-credentials: true",
    ],
  ],
]);

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

function workflowSteps(source) {
  const lines = source.split(/\r?\n/u);
  const steps = [];
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^(\s*)-\s+(?:name|id|uses):/u);
    if (!start) continue;
    const indentation = start[1].length;
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      const nextStep = line.match(/^(\s*)-\s+(?:name|id|uses):/u);
      if (nextStep && nextStep[1].length === indentation) break;
      const leading = line.match(/^(\s*)/u)?.[1].length ?? 0;
      if (line.trim().length > 0 && leading < indentation) break;
      end += 1;
    }
    steps.push(lines.slice(index, end).join("\n"));
    index = end - 1;
  }
  return steps;
}

function scalarInput(step, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `\\b${escapedKey}:\\s*["']?([^"'\\s,#}]+)["']?(?=[ \\t]*(?:[,}#]|$))`,
    "mu",
  );
  return step.match(pattern)?.[1] ?? null;
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

test("workflow runner and action identities are immutable", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    const floatingRunners = [...workflow.source.matchAll(FLOATING_HOSTED_RUNNER)].map(
      (match) => match[0],
    );
    for (const runner of floatingRunners) {
      violations.push(`${workflow.path}: floating runner ${runner}`);
    }
    for (const reference of actionReferences(workflow.source)) {
      if (reference.startsWith("./")) continue;
      if (
        IMMUTABLE_EXTERNAL_ACTION.test(reference) ||
        IMMUTABLE_DOCKER_ACTION.test(reference)
      ) {
        continue;
      }
      violations.push(`${workflow.path}: mutable action ${reference}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Workflow identities must be immutable:\n${violations.join("\n")}`,
  );
});

test("Node and Python setup actions select exact patch releases", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    for (const step of workflowSteps(workflow.source)) {
      const references = actionReferences(step);
      if (references.some((reference) => reference.startsWith("actions/setup-node@"))) {
        const selector = scalarInput(step, "node-version");
        if (!EXACT_PATCH_VERSION.test(selector ?? "")) {
          violations.push(
            `${workflow.path}: setup-node selector ${selector ?? "missing"}`,
          );
        }
      }
      if (references.some((reference) => reference.startsWith("actions/setup-python@"))) {
        const selector = scalarInput(step, "python-version");
        if (!EXACT_PATCH_VERSION.test(selector ?? "")) {
          violations.push(
            `${workflow.path}: setup-python selector ${selector ?? "missing"}`,
          );
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Workflow runtime selectors must be exact patch releases:\n${violations.join("\n")}`,
  );
});

test("checkout credentials are disabled except for exact reviewed publishers", async () => {
  const workflows = await workflowSources();
  const sources = new Map(workflows.map((workflow) => [workflow.path, workflow.source]));
  const persistedCounts = new Map();
  const violations = [];

  for (const workflow of workflows) {
    for (const step of workflowSteps(workflow.source)) {
      if (
        !actionReferences(step).some((reference) =>
          reference.startsWith("actions/checkout@"),
        )
      ) {
        continue;
      }
      if (DISABLED_CHECKOUT_CREDENTIALS.test(step)) continue;
      if (
        PERSISTED_CHECKOUT_ALLOWLIST.has(workflow.path) &&
        ENABLED_CHECKOUT_CREDENTIALS.test(step)
      ) {
        persistedCounts.set(
          workflow.path,
          (persistedCounts.get(workflow.path) ?? 0) + 1,
        );
        continue;
      }
      violations.push(
        `${workflow.path}: ${
          ENABLED_CHECKOUT_CREDENTIALS.test(step)
            ? "persisted credentials are not allowlisted"
            : "checkout credential handling is not explicit"
        }`,
      );
    }
  }

  for (const [workflowPath, requiredEvidence] of PERSISTED_CHECKOUT_ALLOWLIST) {
    const source = sources.get(workflowPath);
    if (source === undefined) {
      violations.push(`${workflowPath}: allowlisted publisher is missing`);
      continue;
    }
    if (persistedCounts.get(workflowPath) !== 1) {
      violations.push(
        `${workflowPath}: expected exactly one credential-persisting checkout`,
      );
    }
    for (const evidence of requiredEvidence) {
      if (!source.includes(evidence)) {
        violations.push(`${workflowPath}: missing publisher evidence ${evidence}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Checkout credential boundary violations:\n${violations.join("\n")}`,
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
