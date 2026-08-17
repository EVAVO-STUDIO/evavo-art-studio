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

const WRITE_PRIMITIVES = Object.freeze([
  {
    kind: "shell-redirection",
    pattern: /(?:^|[\s;}])(?:>>|>(?!>))\s*/u,
  },
  {
    kind: "tee",
    pattern: /(?:^|\s)tee(?:\s|$)/u,
  },
  {
    kind: "powershell-content",
    pattern: /\b(?:Add-Content|Out-File|Set-Content)\b/iu,
  },
  {
    kind: "runtime-append",
    pattern: /\b(?:AppendAllText|appendFileSync|appendFile)\s*\(/u,
  },
]);

function shellContract({ writeLines, evidence = [], forbidden = [] }) {
  return Object.freeze({
    evidence: Object.freeze(evidence),
    forbidden: Object.freeze(forbidden),
    primitiveKinds: Object.freeze(["shell-redirection"]),
    writeCount: writeLines.length,
    writeLines: Object.freeze(writeLines),
  });
}

const APPROVED_COMMAND_FILE_WRITES = new Map([
  [
    ".github/workflows/ci-media-tool-bootstrap.yml#Route Python bytecode to runner-temporary storage::environment",
    shellContract({
      writeLines: [
        'echo "PYTHONPYCACHEPREFIX=${PYTHON_CACHE_ROOT}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "set -euo pipefail",
        'PYTHON_CACHE_ROOT="${RUNNER_TEMP}/media-bootstrap-python-pycache"',
        'mkdir -p "${PYTHON_CACHE_ROOT}"',
      ],
    }),
  ],
  [
    ".github/workflows/ci.yml#Route Python bytecode to runner-temporary storage::environment",
    shellContract({
      writeLines: [
        'echo "PYTHONPYCACHEPREFIX=${PYTHON_CACHE_ROOT}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "set -euo pipefail",
        'PYTHON_CACHE_ROOT="${RUNNER_TEMP}/python-pycache"',
        'mkdir -p "${PYTHON_CACHE_ROOT}"',
      ],
    }),
  ],
  [
    ".github/workflows/ci.yml#Verify committed lockfile identity::environment",
    shellContract({
      writeLines: [
        'echo "ART_STUDIO_LOCKFILE_SHA256=${LOCKFILE_SHA256}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "git ls-files --error-unmatch -- pnpm-lock.yaml",
        'LOCKFILE_SHA256="$(sha256sum pnpm-lock.yaml | awk \'{print $1}\')"',
        '[[ "${LOCKFILE_SHA256}" =~ ^[0-9a-f]{64}$ ]]',
      ],
    }),
  ],
  [
    ".github/workflows/ci.yml#Verify exact Python image toolchain::environment",
    shellContract({
      writeLines: [
        'echo "ART_STUDIO_PYTHON_VERSION=${PYTHON_VERSION}" >> "${GITHUB_ENV}"',
        'echo "ART_STUDIO_PILLOW_VERSION=${PILLOW_VERSION}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        '[[ "${PYTHON_VERSION}" == "3.13.5" ]]',
        '[[ "${PILLOW_VERSION}" == "12.2.0" ]]',
      ],
    }),
  ],
  [
    ".github/workflows/comfyui-provider-adapter.yml#Route Python bytecode to runner-temporary storage::environment",
    shellContract({
      writeLines: [
        'echo "PYTHONPYCACHEPREFIX=${PYTHON_CACHE_ROOT}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "set -euo pipefail",
        'PYTHON_CACHE_ROOT="${RUNNER_TEMP}/python-pycache"',
        'mkdir -p "${PYTHON_CACHE_ROOT}"',
      ],
    }),
  ],
  [
    ".github/workflows/pixel-font-repository-publish.yml#Require explicit publication confirmation and token::output",
    shellContract({
      writeLines: [
        'printf \'target_slug=%s\\n\' "$target_slug" >> "$GITHUB_OUTPUT"',
      ],
      evidence: [
        'owner="${TARGET_REPOSITORY%%/*}"',
        'repository_name="${TARGET_REPOSITORY#*/}"',
        'test "$owner/$repository_name" = "$TARGET_REPOSITORY"',
        '[[ "$owner" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$ ]]',
        '[[ "$repository_name" =~ ^[A-Za-z0-9._-]{1,100}$ ]]',
        'test "$repository_name" != "."',
        'test "$repository_name" != ".."',
        'target_slug="$owner-$repository_name"',
      ],
      forbidden: ['echo "target_slug='],
    }),
  ],
  [
    ".github/workflows/pixel-font-studio-v2.yml#Verify native virtual-display runtime::environment",
    shellContract({
      writeLines: [
        'echo "EVAVO_PIXEL_FONT_XVFB_RUN=${XVFB_RUN}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        'XVFB_RUN="$(command -v xvfb-run)"',
        'XAUTH="$(command -v xauth)"',
        'test -x "${XVFB_RUN}"',
        'test -x "${XAUTH}"',
      ],
    }),
  ],
  [
    ".github/workflows/pixel-font-studio.yml#Route Python bytecode to runner-temporary storage::environment",
    shellContract({
      writeLines: [
        'echo "PYTHONPYCACHEPREFIX=${PYTHON_CACHE_ROOT}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "set -euo pipefail",
        'PYTHON_CACHE_ROOT="${RUNNER_TEMP}/pixel-font-python-pycache"',
        'mkdir -p "${PYTHON_CACHE_ROOT}"',
      ],
    }),
  ],
  [
    ".github/workflows/project-art-review-studio.yml#Route Python bytecode outside the repository::environment",
    shellContract({
      writeLines: [
        'echo "PYTHONPYCACHEPREFIX=${PYTHON_CACHE_ROOT}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "set -euo pipefail",
        'PYTHON_CACHE_ROOT="${RUNNER_TEMP}/project-art-review-pycache"',
        'mkdir -p "${PYTHON_CACHE_ROOT}"',
      ],
    }),
  ],
  [
    ".github/workflows/project-art-workbench.yml#Route Python bytecode outside the repository::environment",
    shellContract({
      writeLines: [
        'echo "PYTHONPYCACHEPREFIX=${PYTHON_CACHE_ROOT}" >> "${GITHUB_ENV}"',
      ],
      evidence: [
        "set -euo pipefail",
        'PYTHON_CACHE_ROOT="${RUNNER_TEMP}/project-art-pycache"',
        'mkdir -p "${PYTHON_CACHE_ROOT}"',
      ],
    }),
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
  return new RegExp(
    String.raw`(?:\$\{?${variable}\}?|\$env:${variable}\b|%${variable}%|\benv:${variable}\b)`,
    "iu",
  );
}

function commandFileSurfaces(workflow) {
  const surfaces = new Map();

  for (const step of workflowSteps(workflow.source)) {
    const name = stepName(step);
    for (const run of runFields(step)) {
      const lines = run.source.split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trimStart().startsWith("#")) continue;

        const primitives = WRITE_PRIMITIVES.filter((primitive) =>
          primitive.pattern.test(line),
        );
        if (primitives.length === 0) continue;

        for (const commandFile of COMMAND_FILES) {
          if (!commandFilePattern(commandFile.variable).test(line)) continue;

          const key = `${workflow.path}#${name}::${commandFile.kind}`;
          const existing = surfaces.get(key) ?? {
            commandFile: commandFile.variable,
            key,
            kind: commandFile.kind,
            lines: [],
            path: workflow.path,
            primitiveKinds: new Set(),
            step: name,
            stepSource: step.source,
            writeLines: [],
          };
          existing.lines.push(run.startLine + index);
          existing.writeLines.push(line.trim());
          for (const primitive of primitives) {
            existing.primitiveKinds.add(primitive.kind);
          }
          surfaces.set(key, existing);
        }
      }
    }
  }

  return [...surfaces.values()].map((surface) => ({
    ...surface,
    primitiveKinds: [...surface.primitiveKinds].sort(),
  }));
}

function exactSorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test("workflow command-file writes are exact-reviewed", async () => {
  const observed = (await workflowSources())
    .flatMap(commandFileSurfaces)
    .sort((left, right) => left.key.localeCompare(right.key));
  const observedKeys = new Set(observed.map((surface) => surface.key));
  const violations = [];

  for (const surface of observed) {
    const contract = APPROVED_COMMAND_FILE_WRITES.get(surface.key);
    if (!contract) {
      violations.push(
        `${surface.key} writes ${surface.commandFile} at lines ${surface.lines.join(", ")} via ${surface.primitiveKinds.join(", ")}`,
      );
      continue;
    }

    if (surface.lines.length !== contract.writeCount) {
      violations.push(
        `${surface.key}: expected ${contract.writeCount} writes, found ${surface.lines.length}`,
      );
    }

    if (
      JSON.stringify(surface.writeLines) !==
      JSON.stringify(contract.writeLines)
    ) {
      violations.push(
        `${surface.key}: expected write lines ${JSON.stringify(contract.writeLines)}, found ${JSON.stringify(surface.writeLines)}`,
      );
    }

    for (const evidence of contract.evidence) {
      if (!surface.stepSource.includes(evidence)) {
        violations.push(`${surface.key}: missing evidence ${evidence}`);
      }
    }

    for (const forbidden of contract.forbidden) {
      if (surface.stepSource.includes(forbidden)) {
        violations.push(`${surface.key}: forbidden evidence ${forbidden}`);
      }
    }

    const expectedPrimitives = exactSorted(contract.primitiveKinds);
    if (
      JSON.stringify(surface.primitiveKinds) !==
      JSON.stringify(expectedPrimitives)
    ) {
      violations.push(
        `${surface.key}: expected primitives ${expectedPrimitives.join(", ")}, found ${surface.primitiveKinds.join(", ")}`,
      );
    }
  }

  for (const approved of exactSorted(APPROVED_COMMAND_FILE_WRITES.keys())) {
    if (!observedKeys.has(approved)) {
      violations.push(`${approved}: approved command-file surface is missing`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workflow command-file authority is unreviewed or drifted:\n${violations.join("\n")}`,
  );
});

test("workflow command-file contracts never admit direct GitHub expressions", () => {
  const violations = [];
  for (const [key, contract] of APPROVED_COMMAND_FILE_WRITES) {
    for (const text of [
      ...contract.evidence,
      ...contract.forbidden,
      ...contract.writeLines,
    ]) {
      if (text.includes("${{")) {
        violations.push(`${key}: contract text contains direct expression`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("command-file authority remains limited to environment and output files", () => {
  const kinds = new Set(
    [...APPROVED_COMMAND_FILE_WRITES.keys()].map((key) =>
      key.slice(key.lastIndexOf("::") + 2),
    ),
  );
  assert.deepEqual(exactSorted(kinds), ["environment", "output"]);
});
