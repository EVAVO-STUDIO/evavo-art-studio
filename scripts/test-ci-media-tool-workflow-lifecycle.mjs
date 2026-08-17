import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");
const MAXIMUM_JOB_TIMEOUT_MINUTES = 120;
const MAXIMUM_ARTIFACT_RETENTION_DAYS = 30;

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

function workflowJobs(source) {
  const lines = source.split(/\r?\n/u);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/u.test(line));
  if (jobsIndex < 0) return [];
  const jobs = [];
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length > 0 && /^\S/u.test(line)) break;
    const start = line.match(/^  ([A-Za-z0-9_.-]+):\s*(?:#.*)?$/u);
    if (!start) continue;
    let end = index + 1;
    while (end < lines.length) {
      const candidate = lines[end];
      if (candidate.trim().length > 0 && /^\S/u.test(candidate)) break;
      if (/^  [A-Za-z0-9_.-]+:\s*(?:#.*)?$/u.test(candidate)) break;
      end += 1;
    }
    jobs.push({
      id: start[1],
      source: lines.slice(index, end).join("\n"),
    });
    index = end - 1;
  }
  return jobs;
}

function scalarInput(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `\\b${escapedKey}:\\s*["']?([^"'\\s,#}]+)["']?(?=[ \\t]*(?:[,}#]|$))`,
    "mu",
  );
  return source.match(pattern)?.[1] ?? null;
}

test("workflows declare explicit permissions and bounded concurrency", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    if (!/^permissions:\s*(?:.*)?$/mu.test(workflow.source)) {
      violations.push(`${workflow.path}: missing top-level permissions`);
    }
    const reusable = /^  workflow_call:\s*(?:.*)?$/mu.test(workflow.source);
    if (!reusable && !/^concurrency:\s*(?:.*)?$/mu.test(workflow.source)) {
      violations.push(`${workflow.path}: missing top-level concurrency`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Workflow authority or concurrency is implicit:\n${violations.join("\n")}`,
  );
});

test("hosted jobs have explicit bounded timeouts", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    for (const job of workflowJobs(workflow.source)) {
      if (!/^    runs-on:\s*/mu.test(job.source)) continue;
      const selector = scalarInput(job.source, "timeout-minutes");
      const timeout = Number(selector);
      if (
        selector === null ||
        !/^\d+$/u.test(selector) ||
        !Number.isSafeInteger(timeout) ||
        timeout < 1 ||
        timeout > MAXIMUM_JOB_TIMEOUT_MINUTES
      ) {
        violations.push(
          `${workflow.path}#${job.id}: timeout ${selector ?? "missing"}`,
        );
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Hosted workflow jobs need 1-${MAXIMUM_JOB_TIMEOUT_MINUTES} minute timeouts:\n${violations.join("\n")}`,
  );
});

test("artifact uploads bound missing-file behavior and retention", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    for (const step of workflowSteps(workflow.source)) {
      if (
        !actionReferences(step).some((reference) =>
          reference.startsWith("actions/upload-artifact@"),
        )
      ) {
        continue;
      }
      const missingBehavior = scalarInput(step, "if-no-files-found");
      if (!new Set(["error", "warn", "ignore"]).has(missingBehavior)) {
        violations.push(
          `${workflow.path}: if-no-files-found ${missingBehavior ?? "missing"}`,
        );
      }
      const selector = scalarInput(step, "retention-days");
      const retention = Number(selector);
      if (
        selector === null ||
        !/^\d+$/u.test(selector) ||
        !Number.isSafeInteger(retention) ||
        retention < 1 ||
        retention > MAXIMUM_ARTIFACT_RETENTION_DAYS
      ) {
        violations.push(
          `${workflow.path}: retention-days ${selector ?? "missing"}`,
        );
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Artifact uploads need explicit behavior and 1-${MAXIMUM_ARTIFACT_RETENTION_DAYS} day retention:\n${violations.join("\n")}`,
  );
});
