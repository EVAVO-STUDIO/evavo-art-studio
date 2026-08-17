import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

// Failure suppression remains zero-authority. Any genuine expected-failure
// probe must be rewritten as an explicit bounded transaction that captures the
// non-zero status, restores strict mode, and asserts the exact expected code.
const APPROVED_FAILURE_SUPPRESSION = new Set([]);

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

function finding(workflow, step, kind, line, source) {
  return {
    key: `${workflow.path}#${step}::${kind}`,
    kind,
    line,
    path: workflow.path,
    source: source.trim(),
    step,
  };
}

function continueOnErrorFinding(workflow, step, line, source) {
  const match = source.match(/^\s*continue-on-error:\s*(.*?)\s*$/u);
  if (!match) return null;
  if (/^false(?:\s+#.*)?$/iu.test(match[1])) return null;
  return finding(workflow, step, "continue-on-error", line, source);
}

function stripShellQuotedContentAndComment(source) {
  let output = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quote !== null) {
      if (quote === '"' && escaped) {
        escaped = false;
        output += " ";
        continue;
      }
      if (quote === '"' && character === "\\") {
        escaped = true;
        output += " ";
        continue;
      }
      if (character === quote) quote = null;
      output += " ";
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      output += " ";
      continue;
    }

    if (
      character === "#" &&
      (index === 0 || /\s/u.test(source[index - 1] ?? ""))
    ) {
      output += " ".repeat(source.length - index);
      break;
    }

    output += character;
  }

  return output;
}

function maskShellTests(source) {
  return source
    .replace(/\[\[[\s\S]*?\]\]/gu, (value) => " ".repeat(value.length))
    .replace(/\(\([\s\S]*?\)\)/gu, (value) => " ".repeat(value.length));
}

function shellStructure(source) {
  return maskShellTests(stripShellQuotedContentAndComment(source));
}

function heredocStart(source) {
  const match = source.match(
    /<<(-)?\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][A-Za-z0-9_]*))/u,
  );
  if (!match) return null;
  return {
    delimiter: match[2] ?? match[3] ?? match[4],
    stripTabs: Boolean(match[1]),
  };
}

function heredocDelimiterMatches(source, heredoc) {
  const withoutYamlIndentation = source.trim();
  if (withoutYamlIndentation === heredoc.delimiter) return true;
  if (!heredoc.stripTabs) return false;
  return source.replace(/^\t+/u, "").trim() === heredoc.delimiter;
}

function failClosedLogicalOrRhs(source) {
  return (
    /\b(?:exit|return)\s+(?:[1-9][0-9]*|-[0-9]+)\b/u.test(source) ||
    /\bexit\s+\/b\s+[1-9][0-9]*\b/iu.test(source) ||
    /(?:^|[;{]\s*)false(?:\s*(?:[;}])|$)/u.test(source) ||
    /\bthrow\b/u.test(source)
  );
}

function everyLogicalOrFailsClosed(source) {
  const rhsSegments = source.split("||").slice(1);
  return (
    rhsSegments.length > 0 &&
    rhsSegments.every((segment) => failClosedLogicalOrRhs(segment))
  );
}

function shellSuppressionKinds(source) {
  const kinds = [];
  const structural = shellStructure(source);

  if (/(?:^|[;&])\s*set\s+\+e(?:\s|$)/u.test(structural)) {
    kinds.push("shell-errexit-disabled");
  }
  if (/(?:^|[;&])\s*set\s+\+o\s+errexit(?:\s|$)/u.test(structural)) {
    kinds.push("shell-errexit-disabled");
  }
  if (/(?:^|[;&])\s*set\s+\+o\s+pipefail(?:\s|$)/u.test(structural)) {
    kinds.push("shell-pipefail-disabled");
  }

  if (/\|\|\s*exit\s+\/b\s+0(?:\s|$)/iu.test(structural)) {
    kinds.push("cmd-success-fallback");
  } else if (
    /\|\|\s*(?:true|:|(?:exit|return)\s+0)(?:\s|$)/u.test(structural)
  ) {
    kinds.push("shell-success-fallback");
  } else if (
    /\|\|/u.test(structural) &&
    !everyLogicalOrFailsClosed(structural)
  ) {
    kinds.push("shell-logical-or");
  }

  if (
    !/\|\|/u.test(structural) &&
    /(?:^|[;&])\s*(?:true|:)\s*$/u.test(structural)
  ) {
    kinds.push("shell-success-tail");
  }

  if (
    /\$ErrorActionPreference\s*=\s*["'](?:Continue|SilentlyContinue|Ignore)["']/iu.test(
      source,
    )
  ) {
    kinds.push("powershell-error-action-preference");
  }
  if (
    /-ErrorAction\s+(?:Continue|SilentlyContinue|Ignore)(?:\s|$)/iu.test(
      source,
    )
  ) {
    kinds.push("powershell-error-action");
  }

  return [...new Set(kinds)];
}

function runSuppressionFindings(workflow, step, run) {
  const findings = [];
  const lines = run.source.split(/\r?\n/u);
  let heredoc = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawSource = lines[index];
    const source = rawSource.trim();

    if (heredoc !== null) {
      if (heredocDelimiterMatches(rawSource, heredoc)) heredoc = null;
      continue;
    }

    if (source.length === 0 || source.startsWith("#")) continue;

    const startedHeredoc = heredocStart(rawSource);
    for (const kind of shellSuppressionKinds(source)) {
      findings.push(
        finding(workflow, step, kind, run.startLine + index, source),
      );
    }
    if (startedHeredoc !== null) heredoc = startedHeredoc;
  }

  return findings;
}

function failureSuppressionSurfaces(workflow) {
  const findings = [];
  const coveredContinueOnErrorLines = new Set();

  for (const step of workflowSteps(workflow.source)) {
    const name = stepName(step);
    const stepLines = step.source.split(/\r?\n/u);

    for (let index = 0; index < stepLines.length; index += 1) {
      const line = step.startLine + index;
      const detected = continueOnErrorFinding(
        workflow,
        name,
        line,
        stepLines[index],
      );
      if (!detected) continue;
      coveredContinueOnErrorLines.add(line);
      findings.push(detected);
    }

    for (const run of runFields(step)) {
      findings.push(...runSuppressionFindings(workflow, name, run));
    }
  }

  const workflowLines = workflow.source.split(/\r?\n/u);
  for (let index = 0; index < workflowLines.length; index += 1) {
    const line = index + 1;
    if (coveredContinueOnErrorLines.has(line)) continue;
    const detected = continueOnErrorFinding(
      workflow,
      `workflow-line-${line}`,
      line,
      workflowLines[index],
    );
    if (detected) findings.push(detected);
  }

  return findings;
}

function exactSorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test("workflow failure-suppression surfaces are exact-reviewed", async () => {
  const observed = (await workflowSources())
    .flatMap(failureSuppressionSurfaces)
    .sort((left, right) =>
      left.key === right.key
        ? left.line - right.line
        : left.key.localeCompare(right.key),
    );
  const observedKeys = new Set(observed.map((surface) => surface.key));
  const violations = [];

  for (const surface of observed) {
    if (APPROVED_FAILURE_SUPPRESSION.has(surface.key)) continue;
    violations.push(`${surface.key} at line ${surface.line}: ${surface.source}`);
  }

  for (const approved of exactSorted(APPROVED_FAILURE_SUPPRESSION)) {
    if (!observedKeys.has(approved)) {
      violations.push(`${approved}: approved suppression surface is missing`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workflow failure suppression is unreviewed:\n${violations.join("\n")}`,
  );
});

test("failure-suppression primitives remain visible to the inventory", () => {
  const workflow = {
    path: ".github/workflows/adversarial-failure-suppression.yml",
    source: [
      "name: adversarial",
      "on: workflow_dispatch",
      "jobs:",
      "  probe:",
      "    runs-on: ubuntu-24.04",
      "    steps:",
      "      - name: Continue on error",
      "        continue-on-error: true",
      "        run: false",
      "      - name: Errexit off",
      "        run: set +e",
      "      - name: Pipefail off",
      "        run: set +o pipefail",
      "      - name: Success fallback",
      "        run: command-that-fails || true",
      "      - name: Generic fallback",
      "        run: command-that-fails || echo recovered",
      "      - name: Success tail",
      "        run: command-that-fails; true",
      "      - name: PowerShell preference",
      "        shell: pwsh",
      "        run: $ErrorActionPreference = 'SilentlyContinue'",
      "      - name: PowerShell switch",
      "        shell: pwsh",
      "        run: Get-Item missing -ErrorAction Ignore",
      "      - name: Cmd success fallback",
      "        shell: cmd",
      "        run: cmd.exe /c exit /b 1 || exit /b 0",
      "      - name: Fail-closed guard",
      "        run: '[[ \"$VALUE\" == ok ]] || { echo bad >&2; exit 1; }'",
      "      - name: Shell test logical or",
      "        run: 'if [[ \"$LEFT\" == yes || \"$RIGHT\" == yes ]]; then printf ok; fi'",
      "      - name: Quoted embedded JavaScript",
      "        run: node -e 'const value = left || right'",
      "      - name: Heredoc embedded JavaScript",
      "        run: |",
      "          node - <<'NODE'",
      "          const value = left || right;",
      "          NODE",
      "",
    ].join("\n"),
  };

  const observed = failureSuppressionSurfaces(workflow)
    .map((surface) => `${surface.step}::${surface.kind}`)
    .sort();

  assert.deepEqual(observed, [
    "Cmd success fallback::cmd-success-fallback",
    "Continue on error::continue-on-error",
    "Errexit off::shell-errexit-disabled",
    "Generic fallback::shell-logical-or",
    "Pipefail off::shell-pipefail-disabled",
    "PowerShell preference::powershell-error-action-preference",
    "PowerShell switch::powershell-error-action",
    "Success fallback::shell-success-fallback",
    "Success tail::shell-success-tail",
  ]);
});

test("failure-suppression exception inventory remains empty", () => {
  assert.deepEqual([...APPROVED_FAILURE_SUPPRESSION], []);
});
