import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const DYNAMIC_EXECUTION_PRIMITIVES = Object.freeze([
  {
    kind: "shell-eval",
    pattern: /(?:^|[\s;&|()])eval(?:\s|$)/u,
  },
  {
    kind: "powershell-eval",
    pattern: /\b(?:Invoke-Expression|iex)\b/iu,
  },
  {
    kind: "shell-source",
    pattern:
      /(?:^|[;&|()]|\b(?:if|then|do|else))\s*(?:source|\.)\s+\S+/u,
  },
  {
    kind: "shell-command-string",
    pattern:
      /\b(?:bash|sh|zsh|dash|ksh)\s+(?:-[A-Za-z]*c|--command)(?:\s|$)/u,
  },
  {
    kind: "powershell-command-string",
    pattern:
      /\b(?:pwsh|powershell)(?:\.exe)?\b[^\n]*(?:-(?:Command|EncodedCommand))\b/iu,
  },
  {
    kind: "cmd-command-string",
    pattern: /\bcmd(?:\.exe)?\s+\/c(?:\s|$)/iu,
  },
  {
    kind: "dynamic-shell-command",
    pattern:
      /(?:^|[\s;&|()])["']?\$\{?[A-Za-z_][A-Za-z0-9_]*\}?["']?\s+(?:-[A-Za-z]*c|--command)(?:\s|$)/u,
  },
  {
    kind: "pipe-to-shell",
    pattern:
      /\|\s*(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh)(?:\s|$)/u,
  },
]);

// Dynamic workflow execution remains zero-authority. If an exact surface is
// ever necessary, it must be reviewed separately with literal command text,
// immutable inputs, bounded transport and adversarial tests rather than being
// silently grandfathered here.
const APPROVED_DYNAMIC_EXECUTION = new Set([]);

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

function dynamicShellSelectors(workflow) {
  const findings = [];

  for (const step of workflowSteps(workflow.source)) {
    const name = stepName(step);
    const lines = step.source.split(/\r?\n/u);

    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^\s*shell:\s*(.+?)\s*$/u);
      if (!match || !match[1].includes("${{")) continue;

      findings.push({
        key: `${workflow.path}#${name}::dynamic-shell-selector`,
        kind: "dynamic-shell-selector",
        line: step.startLine + index,
        path: workflow.path,
        source: lines[index].trim(),
        step: name,
      });
    }
  }

  return findings;
}

function dynamicExecutionSurfaces(workflow) {
  const findings = [...dynamicShellSelectors(workflow)];

  for (const step of workflowSteps(workflow.source)) {
    const name = stepName(step);
    for (const run of runFields(step)) {
      const lines = run.source.split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        const source = lines[index].trim();
        if (source.length === 0 || source.startsWith("#")) continue;

        for (const primitive of DYNAMIC_EXECUTION_PRIMITIVES) {
          if (!primitive.pattern.test(source)) continue;
          findings.push({
            key: `${workflow.path}#${name}::${primitive.kind}`,
            kind: primitive.kind,
            line: run.startLine + index,
            path: workflow.path,
            source,
            step: name,
          });
        }
      }
    }
  }

  return findings;
}

function exactSorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test("workflow dynamic shell execution surfaces are exact-reviewed", async () => {
  const observed = (await workflowSources())
    .flatMap(dynamicExecutionSurfaces)
    .sort((left, right) =>
      left.key === right.key
        ? left.line - right.line
        : left.key.localeCompare(right.key),
    );
  const observedKeys = new Set(observed.map((finding) => finding.key));
  const violations = [];

  for (const finding of observed) {
    if (APPROVED_DYNAMIC_EXECUTION.has(finding.key)) continue;
    violations.push(
      `${finding.key} at line ${finding.line}: ${finding.source}`,
    );
  }

  for (const approved of exactSorted(APPROVED_DYNAMIC_EXECUTION)) {
    if (!observedKeys.has(approved)) {
      violations.push(`${approved}: approved dynamic execution is missing`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workflow dynamic shell authority is unreviewed:\n${violations.join("\n")}`,
  );
});

test("dynamic shell primitives remain visible to the inventory", () => {
  const workflow = {
    path: ".github/workflows/adversarial-dynamic-shell.yml",
    source: [
      "name: adversarial",
      "on: workflow_dispatch",
      "jobs:",
      "  probe:",
      "    runs-on: ubuntu-24.04",
      "    steps:",
      "      - name: Eval",
      "        run: eval \"$COMMAND\"",
      "      - name: Source",
      "        run: source \"$SCRIPT\"",
      "      - name: Conditional source",
      "        run: if test -f \"$SCRIPT\"; then source \"$SCRIPT\"; fi",
      "      - name: Command string",
      "        run: bash -lc 'printf ok'",
      "      - name: Pipe",
      "        run: curl https://example.invalid/install | sh",
      "      - name: PowerShell eval",
      "        shell: pwsh",
      "        run: Invoke-Expression $env:COMMAND",
      "      - name: PowerShell command string",
      "        run: pwsh -NoProfile -Command \"Write-Output ok\"",
      "      - name: Cmd command string",
      "        run: cmd.exe /c echo ok",
      "      - name: Dynamic interpreter",
      "        run: \"$SHELL\" -c \"$COMMAND\"",
      "      - name: Dynamic selector",
      "        shell: ${{ inputs.shell }}",
      "        run: printf ok",
      "",
    ].join("\n"),
  };

  const observed = dynamicExecutionSurfaces(workflow)
    .map((finding) => `${finding.step}::${finding.kind}`)
    .sort();

  assert.deepEqual(observed, [
    "Cmd command string::cmd-command-string",
    "Command string::shell-command-string",
    "Conditional source::shell-source",
    "Dynamic interpreter::dynamic-shell-command",
    "Dynamic selector::dynamic-shell-selector",
    "Eval::shell-eval",
    "Pipe::pipe-to-shell",
    "PowerShell command string::powershell-command-string",
    "PowerShell eval::powershell-eval",
    "Source::shell-source",
  ]);
});

test("dynamic shell exception inventory remains empty", () => {
  assert.deepEqual([...APPROVED_DYNAMIC_EXECUTION], []);
});
