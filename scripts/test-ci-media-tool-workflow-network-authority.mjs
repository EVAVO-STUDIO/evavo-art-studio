import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const NETWORK_PRIMITIVES = [
  { kind: "curl", pattern: /(?:^|\s)curl(?:\s|$)/u },
  { kind: "wget", pattern: /(?:^|\s)wget(?:\s|$)/u },
  {
    kind: "powershell-web-request",
    pattern:
      /\b(?:Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer)\b/iu,
  },
  {
    kind: "python-urllib",
    pattern: /\burllib\.request\.(?:Request|urlopen|urlretrieve)\b/u,
  },
  {
    kind: "python-requests",
    pattern:
      /\brequests\.(?:get|post|put|patch|delete|head|request)\s*\(/u,
  },
  {
    kind: "python-httpx",
    pattern: /\bhttpx\.(?:get|post|put|patch|delete|head|request)\s*\(/u,
  },
  { kind: "node-fetch", pattern: /\bfetch\s*\(/u },
  {
    kind: "node-http",
    pattern: /\b(?:https?|undici)\.(?:get|request)\s*\(/u,
  },
  { kind: "github-api", pattern: /(?:^|\s)gh\s+api(?:\s|$)/u },
  {
    kind: "ephemeral-npm-exec",
    pattern: /(?:^|\s)(?:npx|npm\s+(?:exec|x))(?:\s|$)/u,
  },
  { kind: "ephemeral-pnpm-dlx", pattern: /(?:^|\s)pnpm\s+dlx(?:\s|$)/u },
  { kind: "ephemeral-yarn-dlx", pattern: /(?:^|\s)yarn\s+dlx(?:\s|$)/u },
  { kind: "ephemeral-python-run", pattern: /(?:^|\s)(?:pipx\s+run|uvx)(?:\s|$)/u },
  { kind: "git-clone", pattern: /(?:^|\s)git\s+clone(?:\s|$)/u },
  { kind: "docker-pull", pattern: /(?:^|\s)docker\s+pull(?:\s|$)/u },
  { kind: "go-install", pattern: /(?:^|\s)go\s+install(?:\s|$)/u },
  { kind: "cargo-install", pattern: /(?:^|\s)cargo\s+install(?:\s|$)/u },
  {
    kind: "dotnet-tool-install",
    pattern: /(?:^|\s)dotnet\s+tool\s+install(?:\s|$)/u,
  },
];

// Discovery begins fail-closed. Each admitted surface must later be bound to
// an exact workflow, exact step name and exact primitive kind with its own
// transport, digest and execution contract.
const APPROVED_SURFACES = new Set([]);

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
  const name = step.source.match(/^\s*-\s+name:\s*["']?(.+?)["']?\s*$/mu)?.[1];
  if (name) return name.trim();
  return `unnamed-line-${step.startLine}`;
}

function runSource(step) {
  if (!/^\s+run:\s*/mu.test(step.source) && !/^\s*-\s+run:\s*/mu.test(step.source)) {
    return null;
  }
  return step.source;
}

function networkSurfaces(workflow) {
  const surfaces = [];
  for (const step of workflowSteps(workflow.source)) {
    const source = runSource(step);
    if (source === null) continue;
    for (const primitive of NETWORK_PRIMITIVES) {
      if (!primitive.pattern.test(source)) continue;
      const name = stepName(step);
      surfaces.push({
        key: `${workflow.path}#${name}::${primitive.kind}`,
        path: workflow.path,
        step: name,
        startLine: step.startLine,
        kind: primitive.kind,
      });
    }
  }
  return surfaces;
}

test("workflow network and ephemeral execution surfaces are exact-reviewed", async () => {
  const observed = (await workflowSources())
    .flatMap(networkSurfaces)
    .sort((left, right) => left.key.localeCompare(right.key));
  const observedKeys = new Set(observed.map((surface) => surface.key));
  const violations = [];

  for (const surface of observed) {
    if (!APPROVED_SURFACES.has(surface.key)) {
      violations.push(
        `${surface.key} (starts line ${surface.startLine})`,
      );
    }
  }
  for (const approved of [...APPROVED_SURFACES].sort()) {
    if (!observedKeys.has(approved)) {
      violations.push(`${approved} (approved surface is missing)`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workflow network or ephemeral execution authority is unreviewed:\n${violations.join("\n")}`,
  );
});
