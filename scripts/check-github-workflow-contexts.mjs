#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_WORKFLOW_RELATIVE_ROOT = ".github/workflows";
const ARCHIVE_RELATIVE_ROOT = "ops/github-actions-reference";
const ARCHIVE_WORKFLOW_RELATIVE_ROOT = `${ARCHIVE_RELATIVE_ROOT}/workflows`;
const ACTIVE_README = `${ACTIVE_WORKFLOW_RELATIVE_ROOT}/README.md`;
const ARCHIVE_README = `${ARCHIVE_RELATIVE_ROOT}/README.md`;
const EXPRESSION_CONTEXT = /\$\{\{[\s\S]*?\}\}/gu;
const RUNNER_CONTEXT = /\brunner\s*\./u;
const WORKFLOW_FILE = /\.ya?ml$/u;

function indentation(line) {
  return line.length - line.trimStart().length;
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
  const errors = [];
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

function repositoryPath(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, "/");
}

function inventoryDirectory(repositoryRoot, relativeRoot) {
  const root = path.join(repositoryRoot, relativeRoot);
  if (!fs.existsSync(root)) return Object.freeze({ files: [], links: [] });
  const files = [];
  const links = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        links.push(repositoryPath(repositoryRoot, absolute));
      } else if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile()) {
        files.push(repositoryPath(repositoryRoot, absolute));
      }
    }
  }
  files.sort((left, right) => left.localeCompare(right));
  links.sort((left, right) => left.localeCompare(right));
  return Object.freeze({ files, links });
}

export function checkHostedAutomationPolicy(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
  const active = inventoryDirectory(repositoryRoot, ACTIVE_WORKFLOW_RELATIVE_ROOT);
  const archive = inventoryDirectory(repositoryRoot, ARCHIVE_RELATIVE_ROOT);
  const activeWorkflows = active.files.filter((file) => WORKFLOW_FILE.test(file));
  const archivedWorkflows = archive.files.filter((file) =>
    file.startsWith(`${ARCHIVE_WORKFLOW_RELATIVE_ROOT}/`) && WORKFLOW_FILE.test(file),
  );
  const errors = [];

  for (const file of activeWorkflows) {
    errors.push({
      file,
      line: 1,
      code: "HOSTED_AUTOMATION_ACTIVE_WORKFLOW_FORBIDDEN",
      message: "Art Studio is local-first: active GitHub Actions workflow YAML is forbidden on the zero-cost operating path.",
    });
  }
  for (const file of active.files.filter((file) => file !== ACTIVE_README)) {
    if (WORKFLOW_FILE.test(file)) continue;
    errors.push({
      file,
      line: 1,
      code: "HOSTED_AUTOMATION_ACTIVE_DIRECTORY_UNEXPECTED_FILE",
      message: "Only the zero-cost policy README may remain in .github/workflows.",
    });
  }
  for (const file of [...active.links, ...archive.links]) {
    errors.push({
      file,
      line: 1,
      code: "HOSTED_AUTOMATION_SYMLINK_FORBIDDEN",
      message: "Hosted automation policy roots may not contain symbolic links.",
    });
  }
  if (!active.files.includes(ACTIVE_README)) {
    errors.push({
      file: ACTIVE_README,
      line: 1,
      code: "HOSTED_AUTOMATION_ACTIVE_README_REQUIRED",
      message: "The active workflow directory must retain its explicit zero-cost policy README.",
    });
  }
  if (!archive.files.includes(ARCHIVE_README)) {
    errors.push({
      file: ARCHIVE_README,
      line: 1,
      code: "HOSTED_AUTOMATION_ARCHIVE_README_REQUIRED",
      message: "The inactive workflow reference archive requires an operating-boundary README.",
    });
  }
  if (!archivedWorkflows.length) {
    errors.push({
      file: ARCHIVE_WORKFLOW_RELATIVE_ROOT,
      line: 1,
      code: "HOSTED_AUTOMATION_ARCHIVE_REQUIRED",
      message: "Legacy hosted workflow definitions must remain outside .github/workflows as inactive reference evidence.",
    });
  }

  return Object.freeze({
    schema: "evavo.art-studio.hosted-automation-policy.v2",
    activeWorkflowRoot: ACTIVE_WORKFLOW_RELATIVE_ROOT,
    archiveWorkflowRoot: ARCHIVE_WORKFLOW_RELATIVE_ROOT,
    activeWorkflowFiles: activeWorkflows,
    archivedWorkflowCount: archivedWorkflows.length,
    errors,
    passed: errors.length === 0,
    githubActionsRequired: false,
    vercelRequired: false,
  });
}

function main() {
  const report = checkHostedAutomationPolicy();
  const stream = report.passed ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
