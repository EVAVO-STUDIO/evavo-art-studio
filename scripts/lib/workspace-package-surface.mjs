import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { parseWorkspacePatterns } from "./workspace-validation-coverage.mjs";

export const WORKSPACE_PACKAGE_SURFACE_SCHEMA =
  "evavo.art-studio.workspace-package-surface.v1";

const CONTROL = /[\u0000-\u001f\u007f]/u;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") return false;
    throw error;
  }
}

async function expandPattern(root, pattern) {
  const parts = pattern.split("/");
  let directories = [resolve(root)];
  for (const part of parts) {
    const next = [];
    for (const directory of directories) {
      if (part === "*") {
        const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
          if (error?.code === "ENOENT") return [];
          throw error;
        });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            next.push(resolve(directory, entry.name));
          }
        }
      } else if (!part.includes("*")) {
        next.push(resolve(directory, part));
      } else {
        fail("WORKSPACE_PACKAGE_SURFACE_PATTERN_UNSUPPORTED", pattern);
      }
    }
    directories = next;
  }
  return directories;
}

async function workspaces(root, patterns) {
  const output = new Map();
  for (const pattern of patterns) {
    for (const directory of await expandPattern(root, pattern)) {
      if (await exists(resolve(directory, "package.json"))) {
        output.set(relative(root, directory).split(sep).join("/"), directory);
      }
    }
  }
  return [...output.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function collectTargets(value, field, output) {
  if (typeof value === "string") {
    output.push(Object.freeze({ field, target: value }));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectTargets(entry, `${field}[${index}]`, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    collectTargets(entry, `${field}.${key}`, output);
  }
}

function targetIssue(entry, document) {
  const target = entry.target;
  if (
    !target ||
    CONTROL.test(target) ||
    target.includes("\\") ||
    !target.startsWith("./") ||
    target.split("/").some((part) => part === ".." || part === ".")
  ) {
    return "non-portable-target";
  }
  const normalized = target.toLocaleLowerCase("en-US");
  if (normalized.startsWith("./src/") || normalized === "./src") {
    return "source-export";
  }
  if (normalized.startsWith("./dist/") || normalized === "./dist") {
    const build = document.scripts?.build;
    if (typeof build !== "string" || !build.trim()) return "dist-without-build";
  }
  if (/\.types(?:\.|$)|^types$/u.test(entry.field) && !/\.d\.(?:ts|mts|cts)$/u.test(normalized)) {
    return "types-target-not-declaration";
  }
  return undefined;
}

export async function compileWorkspacePackageSurface(root = process.cwd()) {
  const repositoryRoot = resolve(root);
  const patterns = parseWorkspacePatterns(
    await readFile(resolve(repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
  );
  const entries = await workspaces(repositoryRoot, patterns);
  const packages = [];
  const failures = [];

  for (const [workspacePath, directory] of entries) {
    let document;
    try {
      document = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
    } catch (error) {
      fail(
        "WORKSPACE_PACKAGE_SURFACE_PACKAGE_JSON_INVALID",
        `${workspacePath}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const targets = [];
    if (document.main !== undefined) collectTargets(document.main, "main", targets);
    if (document.module !== undefined) collectTargets(document.module, "module", targets);
    if (document.types !== undefined) collectTargets(document.types, "types", targets);
    if (document.typings !== undefined) collectTargets(document.typings, "typings", targets);
    if (document.exports !== undefined) collectTargets(document.exports, "exports", targets);
    const issues = [];
    for (const target of targets) {
      const issue = targetIssue(target, document);
      if (!issue) continue;
      const failure = Object.freeze({
        workspacePath,
        packageName: document.name ?? null,
        field: target.field,
        target: target.target,
        issue,
      });
      issues.push(failure);
      failures.push(failure);
    }
    const lifecycleCommands = ["build", "typecheck", "test"]
      .map((name) => [name, document.scripts?.[name]])
      .filter(([, command]) => typeof command === "string");
    for (const [name, command] of lifecycleCommands) {
      if (/\b(?:workflow_dispatch|GITHUB_TOKEN|VERCEL_TOKEN)\b/u.test(command) ||
          /^(?:vercel|npx\s+vercel|pnpm\s+(?:dlx|exec)\s+vercel)(?:\s|$)/iu.test(command.trim()) ||
          /^gh\s+(?:workflow|run)(?:\s|$)/iu.test(command.trim())) {
        const failure = Object.freeze({
          workspacePath,
          packageName: document.name ?? null,
          field: `scripts.${name}`,
          target: command,
          issue: "hosted-lifecycle",
        });
        issues.push(failure);
        failures.push(failure);
      }
    }
    packages.push(Object.freeze({
      workspacePath,
      packageName: document.name ?? null,
      targetCount: targets.length,
      targets: Object.freeze(targets),
      issues: Object.freeze(issues),
    }));
  }

  return Object.freeze({
    schema: WORKSPACE_PACKAGE_SURFACE_SCHEMA,
    status: failures.length === 0 ? "passed" : "failed",
    packageCount: packages.length,
    packages: Object.freeze(packages),
    failures: Object.freeze(failures),
    authority: Object.freeze({
      providerExecution: false,
      renderExecution: false,
      publication: false,
      repositoryMutation: false,
      deployment: false,
      githubActionsRequired: false,
      vercelRequired: false,
    }),
  });
}

export async function assertWorkspacePackageSurface(root = process.cwd()) {
  const report = await compileWorkspacePackageSurface(root);
  if (report.status !== "passed") {
    fail("WORKSPACE_PACKAGE_SURFACE_FAILED", JSON.stringify(report.failures));
  }
  return report;
}
