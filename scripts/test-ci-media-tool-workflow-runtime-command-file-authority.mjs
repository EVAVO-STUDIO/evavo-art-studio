import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const COMMAND_FILES = Object.freeze([
  { kind: "output", variable: "GITHUB_OUTPUT" },
  { kind: "environment", variable: "GITHUB_ENV" },
  { kind: "path", variable: "GITHUB_PATH" },
  { kind: "state", variable: "GITHUB_STATE" },
  { kind: "summary", variable: "GITHUB_STEP_SUMMARY" },
]);

const RUNTIME_WRITE_PRIMITIVES = Object.freeze([
  {
    kind: "runtime-file-write",
    pattern:
      /\b(?:AppendAllText|WriteAllText|appendFileSync|appendFile|writeFileSync|writeFile|createWriteStream|write_text|write_bytes|File\.write|IO\.write|fs::write|os\.WriteFile)\s*\(/u,
  },
  {
    kind: "runtime-open-write",
    pattern:
      /(?:\bopen|\.open)\s*\([^\n]*(?:["'][awx+][^"']*["']|flag\s*:\s*["']a)/u,
  },
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

function commandFilePattern(variable) {
  return new RegExp(`\\b${variable}\\b`, "u");
}

function runtimeCommandFileSurfaces(workflow) {
  const surfaces = [];

  for (const step of workflowSteps(workflow.source)) {
    const name = stepName(step);
    for (const run of runFields(step)) {
      const lines = run.source.split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trimStart().startsWith("#")) continue;

        for (const primitive of RUNTIME_WRITE_PRIMITIVES) {
          if (!primitive.pattern.test(line)) continue;
          for (const commandFile of COMMAND_FILES) {
            if (!commandFilePattern(commandFile.variable).test(line)) continue;
            surfaces.push({
              commandFile: commandFile.variable,
              key: `${workflow.path}#${name}::${commandFile.kind}::${primitive.kind}`,
              kind: commandFile.kind,
              line: run.startLine + index,
              path: workflow.path,
              primitive: primitive.kind,
              source: line.trim(),
              step: name,
            });
          }
        }
      }
    }
  }

  return surfaces;
}

test("workflow runtime code never writes GitHub command files", async () => {
  const observed = (await workflowSources())
    .flatMap(runtimeCommandFileSurfaces)
    .sort((left, right) => left.key.localeCompare(right.key));

  assert.deepEqual(
    observed,
    [],
    `Runtime command-file writes are forbidden:\n${observed
      .map(
        (surface) =>
          `${surface.key} at line ${surface.line}: ${surface.source}`,
      )
      .join("\n")}`,
  );
});

test("runtime command-file write forms remain visible to the inventory", () => {
  const workflow = {
    path: ".github/workflows/adversarial-command-files.yml",
    source: `name: adversarial
on: workflow_dispatch
jobs:
  probe:
    runs-on: ubuntu-24.04
    steps:
      - name: Python append
        run: |
          with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as handle:
            handle.write("SAFE=1\\n")
      - name: Node append
        run: |
          appendFileSync(process.env.GITHUB_OUTPUT, "safe=1\\n")
      - name: Dotnet append
        run: |
          File.AppendAllText(Environment.GetEnvironmentVariable("GITHUB_STEP_SUMMARY"), "safe")
      - name: Ruby write
        run: |
          File.write(ENV["GITHUB_STATE"], "safe=1\\n")
`,
  };

  const observed = runtimeCommandFileSurfaces(workflow)
    .map((surface) => `${surface.step}::${surface.kind}::${surface.primitive}`)
    .sort();

  assert.deepEqual(observed, [
    "Dotnet append::summary::runtime-file-write",
    "Node append::output::runtime-file-write",
    "Python append::environment::runtime-open-write",
    "Ruby write::state::runtime-file-write",
  ]);
});
