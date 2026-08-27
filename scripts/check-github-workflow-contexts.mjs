#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(REPOSITORY_ROOT, ".github", "workflows");
const EXPRESSION_CONTEXT = /\$\{\{[\s\S]*?\}\}/gu;
const RUNNER_CONTEXT = /\brunner\s*\./u;
const MANUAL_ONLY_CORE_WORKFLOWS = new Set([
  ".github/workflows/ci.yml",
  ".github/workflows/game-art-workstations.yml",
  ".github/workflows/council-avatar-production.yml",
]);

function indentation(line) {
  return line.length - line.trimStart().length;
}


function workflowTriggers(lines) {
  const onIndex = lines.findIndex((line) => /^on:\s*(?:#.*)?$/u.test(line));
  if (onIndex < 0) {
    const inline = lines.find((line) => /^on:\s*\S/u.test(line));
    if (!inline) return [];
    const value = inline.replace(/^on:\s*/u, "").replace(/\s+#.*$/u, "").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      return value.slice(1, -1).split(",").map((entry) => entry.trim()).filter(Boolean);
    }
    return value ? [value] : [];
  }
  const triggers = [];
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (indentation(line) === 0) break;
    const match = /^ {2}([A-Za-z_][A-Za-z0-9_-]*):/u.exec(line);
    if (match) triggers.push(match[1]);
  }
  return triggers;
}

function manualOnlyWorkflowErrors(lines, fileName) {
  if (!MANUAL_ONLY_CORE_WORKFLOWS.has(fileName)) return [];
  const triggers = workflowTriggers(lines);
  const errors = [];
  if (!triggers.includes("workflow_dispatch")) {
    errors.push({
      file: fileName,
      line: 1,
      code: "CORE_WORKFLOW_MANUAL_DISPATCH_REQUIRED",
      message: "core hosted validation must remain explicitly manual and locally reproducible.",
    });
  }
  const automatic = triggers.filter((trigger) => trigger !== "workflow_dispatch");
  if (automatic.length) {
    errors.push({
      file: fileName,
      line: 1,
      code: "CORE_WORKFLOW_AUTOMATIC_TRIGGER_FORBIDDEN",
      message: `core hosted validation may not run automatically (${automatic.join(", ")}); local validation is authoritative.`,
    });
  }
  return errors;
}

function blockContainsRunner(lines, startIndex, blockIndent) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (indentation(line) <= blockIndent) break;
    for (const expression of line.matchAll(EXPRESSION_CONTEXT)) {
      if (RUNNER_CONTEXT.test(expression[0])) return index;
    }
  }
  return -1;
}

export function scanWorkflowContextErrors(content, fileName = "workflow.yml") {
  if (typeof content !== "string") throw new TypeError("workflow content must be a string");
  const lines = content.replace(/\r\n?/gu, "\n").split("\n");
  const errors = [...manualOnlyWorkflowErrors(lines, fileName)];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^env:\s*(?:#.*)?$/u.test(line)) {
      const offending = blockContainsRunner(lines, index, 0);
      if (offending >= 0) {
        errors.push({
          file: fileName,
          line: offending + 1,
          code: "WORKFLOW_ROOT_ENV_RUNNER_CONTEXT",
          message: "runner context is unavailable in workflow-level env; assign runner paths from a step.",
        });
      }
    }
    if (/^ {4}env:\s*(?:#.*)?$/u.test(line)) {
      const offending = blockContainsRunner(lines, index, 4);
      if (offending >= 0) {
        errors.push({
          file: fileName,
          line: offending + 1,
          code: "WORKFLOW_JOB_ENV_RUNNER_CONTEXT",
          message: "runner context is unavailable in jobs.<job_id>.env; assign runner paths from a step.",
        });
      }
    }
    if (/^ {4}(?:if|runs-on):/u.test(line)) {
      for (const expression of line.matchAll(EXPRESSION_CONTEXT)) {
        if (RUNNER_CONTEXT.test(expression[0])) {
          errors.push({
            file: fileName,
            line: index + 1,
            code: "WORKFLOW_JOB_ROUTING_RUNNER_CONTEXT",
            message: "runner context is unavailable before a job has been routed to a runner.",
          });
        }
      }
    }
  }
  return errors;
}

function workflowFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function checkWorkflowContexts(root = WORKFLOW_ROOT) {
  const files = workflowFiles(root);
  const errors = files.flatMap((file) =>
    scanWorkflowContextErrors(fs.readFileSync(file, "utf8"), path.relative(REPOSITORY_ROOT, file).replaceAll(path.sep, "/")),
  );
  return Object.freeze({
    schema: "evavo.art-studio.workflow-context-check.v1",
    checkedFiles: files.length,
    errors,
    passed: errors.length === 0,
  });
}

function main() {
  const report = checkWorkflowContexts();
  const stream = report.passed ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
