import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const NETWORK_PRIMITIVES = [
  ["curl", /(?:^|\s)curl(?:\s|$)/u],
  ["wget", /(?:^|\s)wget(?:\s|$)/u],
  [
    "powershell-web-request",
    /\b(?:Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer)\b/iu,
  ],
  [
    "python-urllib",
    /\burllib\.request\.(?:Request|urlopen|urlretrieve)\b/u,
  ],
  [
    "python-requests",
    /\brequests\.(?:get|post|put|patch|delete|head|request)\s*\(/u,
  ],
  [
    "python-httpx",
    /\bhttpx\.(?:get|post|put|patch|delete|head|request)\s*\(/u,
  ],
  ["node-fetch", /\bfetch\s*\(/u],
  ["node-http", /\b(?:https?|undici)\.(?:get|request)\s*\(/u],
  ["github-api", /(?:^|\s)gh\s+api(?:\s|$)/u],
  [
    "ephemeral-npm-exec",
    /(?:^|\s)(?:npx|npm\s+(?:exec|x))(?:\s|$)/u,
  ],
  ["ephemeral-pnpm-dlx", /(?:^|\s)pnpm\s+dlx(?:\s|$)/u],
  ["ephemeral-yarn-dlx", /(?:^|\s)yarn\s+dlx(?:\s|$)/u],
  [
    "ephemeral-python-run",
    /(?:^|\s)(?:pipx\s+run|uvx)(?:\s|$)/u,
  ],
  ["git-clone", /(?:^|\s)git\s+clone(?:\s|$)/u],
  ["docker-pull", /(?:^|\s)docker\s+pull(?:\s|$)/u],
  ["go-install", /(?:^|\s)go\s+install(?:\s|$)/u],
  ["cargo-install", /(?:^|\s)cargo\s+install(?:\s|$)/u],
  [
    "dotnet-tool-install",
    /(?:^|\s)dotnet\s+tool\s+install(?:\s|$)/u,
  ],
].map(([kind, pattern]) => ({ kind, pattern }));

const FINALIZER_SURFACE =
  ".github/workflows/finalize-pixel-typography-review.yml#Materialize exact reviewed source overlay::python-urllib";
const GODOT_SURFACE =
  ".github/workflows/pixel-font-studio-v2.yml#Download and verify official Godot 4.6.2::curl";
const RECONCILIATION_SURFACE =
  ".github/workflows/repair-pixel-typography-review.yml#Reconcile exact reviewed native-review source::python-urllib";

function githubBlobContract(confirmation) {
  return {
    workflowRequired: [
      "on:\n  workflow_dispatch:",
      "expected_sha:",
      confirmation,
      "permissions:\n  contents: write",
      "ref: ${{ inputs.expected_sha }}",
      "persist-credentials: true",
    ],
    stepRequired: [
      'f"https://api.github.com/repos/{repository}/git/blobs/{blob}"',
      '"Authorization": f"Bearer {token}"',
      '"X-GitHub-Api-Version": "2022-11-28"',
      "urllib.request.urlopen(request, timeout=60)",
      'base64.b64decode(payload["content"].replace("\\n", ""), validate=True)',
      "path.write_bytes(data)",
      'subprocess.check_output(["git", "hash-object", relative], text=True).strip()',
      "if observed != blob:",
    ],
    orderedStepEvidence: [
      'f"https://api.github.com/repos/{repository}/git/blobs/{blob}"',
      "urllib.request.urlopen(request, timeout=60)",
      'base64.b64decode(payload["content"].replace("\\n", ""), validate=True)',
      "path.write_bytes(data)",
      'subprocess.check_output(["git", "hash-object", relative], text=True).strip()',
      "if observed != blob:",
    ],
  };
}

const APPROVED_SURFACE_CONTRACTS = new Map([
  [
    FINALIZER_SURFACE,
    githubBlobContract("FINALIZE_PIXEL_TYPOGRAPHY_REVIEW"),
  ],
  [
    GODOT_SURFACE,
    {
      workflowRequired: [
        'GODOT_VERSION: "4.6.2"',
        'GODOT_ARCHIVE_SHA256: "30e6b6d141f0cd5bebd629ad1d0ef1324e60091bb20662d026b402ba58c59937"',
        "permissions:\n  contents: read",
      ],
      stepRequired: [
        "curl --fail --location --proto '=https' --tlsv1.2",
        "--retry 3 --retry-all-errors --connect-timeout 20 --max-time 180",
        '"https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip"',
        'echo "${GODOT_ARCHIVE_SHA256}  ${archive}" | sha256sum --check --strict',
        'unzip -q "$archive" -d "$RUNNER_TEMP/godot"',
        'chmod +x "$RUNNER_TEMP/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64"',
        '"$RUNNER_TEMP/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64" --version',
      ],
      orderedStepEvidence: [
        "curl --fail --location --proto '=https' --tlsv1.2",
        'echo "${GODOT_ARCHIVE_SHA256}  ${archive}" | sha256sum --check --strict',
        'unzip -q "$archive" -d "$RUNNER_TEMP/godot"',
        'chmod +x "$RUNNER_TEMP/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64"',
        '"$RUNNER_TEMP/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64" --version',
      ],
    },
  ],
  [
    RECONCILIATION_SURFACE,
    githubBlobContract("RECONCILE_PIXEL_TYPOGRAPHY_REVIEW"),
  ],
]);
const APPROVED_SURFACES = new Set(APPROVED_SURFACE_CONTRACTS.keys());

async function workflowSources() {
  const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true });
  return Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
      )
      .map((entry) => path.join(WORKFLOW_ROOT, entry.name))
      .sort()
      .map(async (workflowPath) => ({
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
  return name?.trim() ?? `unnamed-line-${step.startLine}`;
}

function executableSource(step) {
  if (
    !/^\s+run:\s*/mu.test(step.source) &&
    !/^\s*-\s+run:\s*/mu.test(step.source)
  ) {
    return null;
  }
  return step.source
    .split(/\r?\n/u)
    .filter((rawLine) => {
      const line = rawLine.trim();
      return !/^!?\s*grep\b/u.test(line) && !/^#/u.test(line);
    })
    .join("\n");
}

function networkSurfaces(workflow) {
  const surfaces = [];
  for (const step of workflowSteps(workflow.source)) {
    const source = executableSource(step);
    if (source === null) continue;
    for (const primitive of NETWORK_PRIMITIVES) {
      if (!primitive.pattern.test(source)) continue;
      const name = stepName(step);
      surfaces.push({
        key: `${workflow.path}#${name}::${primitive.kind}`,
        path: workflow.path,
        startLine: step.startLine,
        kind: primitive.kind,
        stepSource: step.source,
      });
    }
  }
  return surfaces;
}

function assertRequired(source, required, label, violations) {
  for (const evidence of required) {
    if (!source.includes(evidence)) {
      violations.push(`${label}: missing evidence ${evidence}`);
    }
  }
}

function assertOrdered(source, evidence, label, violations) {
  let previous = -1;
  for (const item of evidence) {
    const index = source.indexOf(item, previous + 1);
    if (index < 0) {
      violations.push(`${label}: missing ordered evidence ${item}`);
      continue;
    }
    if (index <= previous) {
      violations.push(`${label}: evidence is out of order ${item}`);
    }
    previous = index;
  }
}

test("workflow network and ephemeral execution surfaces are exact-reviewed", async () => {
  const observed = (await workflowSources())
    .flatMap(networkSurfaces)
    .sort((left, right) => left.key.localeCompare(right.key));
  const observedKeys = new Set(observed.map((surface) => surface.key));
  const violations = [];

  for (const surface of observed) {
    if (!APPROVED_SURFACES.has(surface.key)) {
      violations.push(`${surface.key} (starts line ${surface.startLine})`);
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

test("approved workflow network surfaces retain exact transport and digest contracts", async () => {
  const workflows = await workflowSources();
  const workflowMap = new Map(workflows.map((workflow) => [workflow.path, workflow]));
  const surfaceMap = new Map(
    workflows.flatMap(networkSurfaces).map((surface) => [surface.key, surface]),
  );
  const violations = [];

  for (const [key, contract] of APPROVED_SURFACE_CONTRACTS) {
    const surface = surfaceMap.get(key);
    if (surface === undefined) {
      violations.push(`${key}: approved surface is missing`);
      continue;
    }
    const workflow = workflowMap.get(surface.path);
    assert.ok(workflow, surface.path);
    assertRequired(workflow.source, contract.workflowRequired, key, violations);
    assertRequired(surface.stepSource, contract.stepRequired, key, violations);
    assertOrdered(
      surface.stepSource,
      contract.orderedStepEvidence,
      key,
      violations,
    );
  }

  assert.deepEqual(
    violations,
    [],
    `Approved network contracts drifted:\n${violations.join("\n")}`,
  );
});

test("ephemeral remote package execution is forbidden", async () => {
  const forbiddenKinds = new Set([
    "ephemeral-npm-exec",
    "ephemeral-pnpm-dlx",
    "ephemeral-yarn-dlx",
    "ephemeral-python-run",
    "go-install",
    "cargo-install",
    "dotnet-tool-install",
  ]);
  const violations = (await workflowSources())
    .flatMap(networkSurfaces)
    .filter((surface) => forbiddenKinds.has(surface.kind))
    .map((surface) => surface.key)
    .sort();
  assert.deepEqual(
    violations,
    [],
    `Ephemeral remote execution is forbidden:\n${violations.join("\n")}`,
  );
});
