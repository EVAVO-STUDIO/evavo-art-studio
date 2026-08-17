import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_ROOT = path.join(ROOT, ".github/workflows");

const WRITE_PERMISSION_ALLOWLIST = new Map([
  [
    ".github/workflows/finalize-pixel-typography-review.yml",
    {
      events: ["push", "workflow_dispatch"],
      writes: ["contents"],
      requiredEvidence: [
        "permissions:\n  contents: write",
        "persist-credentials: true",
        "git push origin HEAD:main",
        'test "$remote" = "$published"',
        "cancel-in-progress: false",
      ],
    },
  ],
  [
    ".github/workflows/repair-pixel-typography-review.yml",
    {
      events: ["workflow_dispatch"],
      writes: ["contents"],
      requiredEvidence: [
        "permissions:\n  contents: write",
        "persist-credentials: true",
        "git push origin HEAD:main",
        'test "$remote" = "$published"',
        "cancel-in-progress: false",
      ],
    },
  ],
]);

const PRIVILEGED_WORKFLOW_ALLOWLIST = new Map([
  [
    ".github/workflows/finalize-pixel-typography-review.yml",
    {
      events: ["push", "workflow_dispatch"],
      requiredEvidence: [
        "permissions:\n  contents: write",
        "persist-credentials: true",
        "git push origin HEAD:main",
        "Require exact current main and reviewed baseline files",
      ],
    },
  ],
  [
    ".github/workflows/repair-pixel-typography-review.yml",
    {
      events: ["workflow_dispatch"],
      requiredEvidence: [
        "permissions:\n  contents: write",
        "persist-credentials: true",
        "git push origin HEAD:main",
        "Require explicit publication confirmation and token",
      ],
    },
  ],
  [
    ".github/workflows/pixel-font-repository-publish.yml",
    {
      events: ["workflow_call", "workflow_dispatch"],
      requiredEvidence: [
        "permissions:\n  contents: read",
        "TARGET_TOKEN: ${{ secrets.repository_token || secrets.EVAVO_PIXEL_FONT_REPOSITORY_TOKEN }}",
        "persist-credentials: true",
        "--confirm-publish",
        "confirmation:",
        "cancel-in-progress: false",
      ],
    },
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
      for (const item of inline.replace(/^\[/u, "").replace(/\]\s*$/u, "").split(",")) {
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

function permissionBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)permissions:\s*(.*)$/u);
    if (!match) continue;
    const indentation = match[1].length;
    const inline = match[2].trim();
    const entries = [];
    let mode = null;

    if (inline.length > 0) {
      if (inline.startsWith("{")) {
        for (const entry of inline.matchAll(
          /([a-z][a-z0-9-]*):\s*([a-z-]+)/gu,
        )) {
          entries.push({ scope: entry[1], access: entry[2] });
        }
      } else {
        mode = inline.replace(/^['"]|['"]$/gu, "");
      }
    } else {
      let end = index + 1;
      while (end < lines.length) {
        const line = lines[end];
        const leading = line.match(/^(\s*)/u)?.[1].length ?? 0;
        if (line.trim().length > 0 && leading <= indentation) break;
        const entry = line.match(/^\s+([a-z][a-z0-9-]*):\s*['"]?([a-z-]+)['"]?/u);
        if (entry) entries.push({ scope: entry[1], access: entry[2] });
        end += 1;
      }
      index = end - 1;
    }

    blocks.push({ indentation, mode, entries });
  }
  return blocks;
}

function writePermissions(source) {
  const writes = [];
  for (const block of permissionBlocks(source)) {
    if (block.mode === "write-all") {
      writes.push({ scope: "write-all", indentation: block.indentation });
    }
    for (const entry of block.entries) {
      if (entry.access === "write") {
        writes.push({ scope: entry.scope, indentation: block.indentation });
      }
    }
  }
  return writes;
}

function secretReferences(source) {
  return [
    ...source.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)[^}]*\}\}/gu),
  ].map((match) => match[1]);
}

function persistedCredentialCount(source) {
  return [
    ...source.matchAll(
      /\bpersist-credentials:\s*['"]?true['"]?(?=[ \t]*(?:[,}#]|$))/gmu,
    ),
  ].length;
}

function executableMutationCommands(source) {
  const commands = [];
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim().replace(/^-\s+/u, "");
    if (/^(?:run:\s*)?git\s+push\b/u.test(line)) {
      commands.push(line);
      continue;
    }
    if (/^(?:run:\s*)?git\s+-c\s+.+\s+push\b/u.test(line)) {
      commands.push(line);
      continue;
    }
    if (
      /^(?:run:\s*)?gh\s+api\b.*(?:--method|-X)\s*(?:POST|PUT|PATCH|DELETE)\b/iu.test(
        line,
      )
    ) {
      commands.push(line);
      continue;
    }
    if (
      /^(?:run:\s*)?curl\b.*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/iu.test(
        line,
      )
    ) {
      commands.push(line);
      continue;
    }
    if (
      /^(?:run:\s*)?(?:Invoke-RestMethod|Invoke-WebRequest)\b.*-Method\s+(?:Post|Put|Patch|Delete)\b/iu.test(
        line,
      )
    ) {
      commands.push(line);
    }
  }
  return commands;
}

function exactSorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function isPrivileged(workflow) {
  return (
    writePermissions(workflow.source).length > 0 ||
    secretReferences(workflow.source).length > 0 ||
    persistedCredentialCount(workflow.source) > 0 ||
    executableMutationCommands(workflow.source).length > 0
  );
}

test("workflow write permissions are exact and allowlisted", async () => {
  const violations = [];
  const observed = new Set();

  for (const workflow of await workflowSources()) {
    const writes = writePermissions(workflow.source);
    if (writes.length === 0) continue;
    observed.add(workflow.path);
    const authority = WRITE_PERMISSION_ALLOWLIST.get(workflow.path);
    if (authority === undefined) {
      violations.push(
        `${workflow.path}: unreviewed write permissions ${writes
          .map((entry) => `${entry.scope}@indent-${entry.indentation}`)
          .join(", ")}`,
      );
      continue;
    }

    if (writes.some((entry) => entry.indentation !== 0)) {
      violations.push(`${workflow.path}: job-level write permission is not allowed`);
    }
    const scopes = exactSorted(writes.map((entry) => entry.scope));
    assert.deepEqual(
      scopes,
      exactSorted(authority.writes),
      `${workflow.path}: write scopes changed`,
    );
    const events = exactSorted(workflowEvents(workflow.source));
    assert.deepEqual(
      events,
      exactSorted(authority.events),
      `${workflow.path}: privileged event surface changed`,
    );
    for (const evidence of authority.requiredEvidence) {
      if (!workflow.source.includes(evidence)) {
        violations.push(`${workflow.path}: missing write-authority evidence ${evidence}`);
      }
    }
  }

  for (const workflowPath of WRITE_PERMISSION_ALLOWLIST.keys()) {
    if (!observed.has(workflowPath)) {
      violations.push(`${workflowPath}: allowlisted write authority is missing`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Workflow write authority drifted:\n${violations.join("\n")}`,
  );
});

test("pull-request events never receive privileged workflow authority", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    const events = workflowEvents(workflow.source);
    if (!events.has("pull_request") && !events.has("pull_request_target")) continue;
    if (!isPrivileged(workflow)) continue;
    violations.push(
      `${workflow.path}: ${exactSorted(events).join(", ")} exposes privileged authority`,
    );
  }
  assert.deepEqual(
    violations,
    [],
    `Privileged workflows must not run from pull-request events:\n${violations.join("\n")}`,
  );
});

test("privileged workflow surfaces remain an exact reviewed set", async () => {
  const workflows = await workflowSources();
  const privileged = workflows.filter(isPrivileged);
  const observed = exactSorted(privileged.map((workflow) => workflow.path));
  const expected = exactSorted(PRIVILEGED_WORKFLOW_ALLOWLIST.keys());
  assert.deepEqual(
    observed,
    expected,
    `Privileged workflow inventory changed:\nobserved ${observed.join(", ")}\nexpected ${expected.join(", ")}`,
  );

  const violations = [];
  for (const workflow of privileged) {
    const authority = PRIVILEGED_WORKFLOW_ALLOWLIST.get(workflow.path);
    assert.ok(authority, workflow.path);
    const events = exactSorted(workflowEvents(workflow.source));
    assert.deepEqual(
      events,
      exactSorted(authority.events),
      `${workflow.path}: privileged event surface changed`,
    );
    if (events.includes("pull_request_target")) {
      violations.push(`${workflow.path}: pull_request_target is forbidden`);
    }
    for (const evidence of authority.requiredEvidence) {
      if (!workflow.source.includes(evidence)) {
        violations.push(`${workflow.path}: missing privileged evidence ${evidence}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Privileged workflow evidence drifted:\n${violations.join("\n")}`,
  );
});

test("workflow permissions never use write-all", async () => {
  const violations = [];
  for (const workflow of await workflowSources()) {
    for (const block of permissionBlocks(workflow.source)) {
      if (block.mode === "write-all") {
        violations.push(`${workflow.path}: permissions write-all`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `write-all is forbidden:\n${violations.join("\n")}`,
  );
});
