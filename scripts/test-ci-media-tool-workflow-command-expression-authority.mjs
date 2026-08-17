import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

// Direct interpolation into a run command happens before the selected shell
// parses the script. Values that can originate outside the committed workflow
// must instead cross an explicit step env boundary and be referenced as quoted
// shell variables. Discovery begins fail-closed with no admitted exceptions.
const APPROVED_DIRECT_INTERPOLATIONS = new Set([]);

const DANGEROUS_REFERENCES = [
  {
    kind: "event-payload",
    pattern: /\bgithub\.event(?:\b|\.)/u,
  },
  {
    kind: "workflow-input",
    pattern: /\binputs(?:\.|\[)/u,
  },
  {
    kind: "secret",
    pattern: /\bsecrets(?:\.|\[)/u,
  },
  {
    kind: "github-token",
    pattern: /\bgithub\.token\b/u,
  },
  {
    kind: "mutable-ref",
    pattern: /\bgithub\.(?:head_ref|base_ref|ref|ref_name)\b/u,
  },
  {
    kind: "actor-identity",
    pattern: /\bgithub\.(?:actor|triggering_actor)\b/u,
  },
  {
    kind: "repository-variable",
    pattern: /\bvars(?:\.|\[)/u,
  },
  {
    kind: "workflow-env-expression",
    pattern: /\benv(?:\.|\[)/u,
  },
  {
    kind: "matrix-value",
    pattern: /\bmatrix(?:\.|\[)/u,
  },
  {
    kind: "dynamic-job-output",
    pattern:
      /\b(?:needs|steps)\.[A-Za-z0-9_-]+\.(?:outputs(?:\.|\[)|result\b|conclusion\b|outcome\b)/u,
  },
];

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

function topLevelBlock(source, key) {
  const lines = source.split(/\r?\n/u);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`^${escapedKey}:\\s*(.*)$`, "u");
  const start = lines.findIndex((line) => pattern.test(line));
  if (start < 0) return null;

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim().length > 0 && /^\S/u.test(line)) break;
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}

function workflowEvents(source) {
  const block = topLevelBlock(source, "on");
  if (block === null) return new Set();
  const lines = block.split(/\r?\n/u);
  const events = new Set();
  const inline = lines[0].replace(/^on:\s*/u, "").trim();

  if (inline.length > 0) {
    if (inline.startsWith("[")) {
      for (const item of inline
        .replace(/^\[/u, "")
        .replace(/\]\s*$/u, "")
        .split(",")) {
        const event = item.trim().replace(/^['"]|['"]$/gu, "");
        if (event) events.add(event);
      }
    } else if (inline.startsWith("{")) {
      for (const match of inline.matchAll(/([A-Za-z0-9_-]+)\s*:/gu)) {
        events.add(match[1]);
      }
    } else {
      events.add(inline.replace(/^['"]|['"]$/gu, ""));
    }
  }

  for (const line of lines.slice(1)) {
    const match = line.match(/^  ([A-Za-z0-9_-]+):/u);
    if (match) events.add(match[1]);
  }
  return events;
}

function workflowSteps(source) {
  const lines = source.split(/\r?\n/u);
  const steps = [];

  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^(\s*)-\s+(?:name|id|uses|run):/u);
    if (!start) continue;
    const indentation = start[1].length;
    let end = index + 1;

    while (end < lines.length) {
      const line = lines[end];
      const nextStep = line.match(/^(\s*)-\s+(?:name|id|uses|run):/u);
      if (nextStep && nextStep[1].length === indentation) break;
      const leading = line.match(/^(\s*)/u)?.[1].length ?? 0;
      if (line.trim().length > 0 && leading < indentation) break;
      end += 1;
    }

    steps.push({
      startLine: index + 1,
      source: lines.slice(index, end).join("\n"),
    });
    index = end - 1;
  }
  return steps;
}

function stepName(step) {
  const name = step.source.match(
    /^\s*-\s+name:\s*["']?(.+?)["']?\s*$/mu,
  )?.[1];
  if (name) return name.trim();
  return `unnamed-line-${step.startLine}`;
}

function runFields(step) {
  const lines = step.source.split(/\r?\n/u);
  const fields = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(-\s+)?run:\s*(.*)$/u);
    if (!match) continue;

    const keyIndentation = match[1].length + (match[2]?.length ?? 0);
    const inline = match[3];
    const blockIndicator = /^[>|][+-]?\d?\s*(?:#.*)?$/u.test(inline.trim());

    if (!blockIndicator) {
      fields.push({
        startLine: step.startLine + index,
        source: inline,
      });
      continue;
    }

    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      const leading = line.match(/^(\s*)/u)?.[1].length ?? 0;
      if (line.trim().length > 0 && leading <= keyIndentation) break;
      end += 1;
    }

    fields.push({
      startLine: step.startLine + index + 1,
      source: lines.slice(index + 1, end).join("\n"),
    });
    index = end - 1;
  }

  return fields;
}

function normalizedExpression(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function expressionLine(run, offset) {
  return (
    run.startLine +
    run.source.slice(0, offset).split(/\r?\n/u).length -
    1
  );
}

function dangerousInterpolations(workflow) {
  const findings = [];

  for (const step of workflowSteps(workflow.source)) {
    for (const run of runFields(step)) {
      for (const match of run.source.matchAll(/\$\{\{([\s\S]*?)\}\}/gu)) {
        const expression = normalizedExpression(match[1]);
        for (const authority of DANGEROUS_REFERENCES) {
          if (!authority.pattern.test(expression)) continue;
          const key = `${workflow.path}#${stepName(step)}::${authority.kind}::${expression}`;
          findings.push({
            expression,
            key,
            kind: authority.kind,
            line: expressionLine(run, match.index ?? 0),
            path: workflow.path,
            step: stepName(step),
          });
        }
      }
    }
  }

  return findings;
}

test("pull_request_target is forbidden repository-wide", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    if (workflowEvents(workflow.source).has("pull_request_target")) {
      violations.push(`${workflow.path}: pull_request_target`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `pull_request_target is forbidden:\n${violations.join("\n")}`,
  );
});

test("untrusted workflow expressions never interpolate directly into run commands", async () => {
  const findings = (await workflowSources())
    .flatMap(dangerousInterpolations)
    .sort((left, right) => left.key.localeCompare(right.key));
  const observed = new Set(findings.map((finding) => finding.key));
  const violations = [];

  for (const finding of findings) {
    if (APPROVED_DIRECT_INTERPOLATIONS.has(finding.key)) continue;
    violations.push(
      `${finding.path}#${finding.step}::${finding.kind} at line ${finding.line}: ` +
        "${{ " +
        finding.expression +
        " }}",
    );
  }

  for (const approved of [...APPROVED_DIRECT_INTERPOLATIONS].sort()) {
    if (!observed.has(approved)) {
      violations.push(`${approved}: approved interpolation is missing`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Untrusted expressions must cross a step env boundary before shell execution:\n${violations.join("\n")}`,
  );
});
