import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const WORKSPACE_VALIDATION_COVERAGE_SCHEMA =
  "evavo.art-studio.workspace-validation-coverage.v1";

const SOURCE_EXTENSION = /\.(?:ts|tsx|mts|cts)$/u;
const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
const PLACEHOLDER = /(?:^|\s)(?:echo\s+["']?(?:todo|not implemented|placeholder)|exit\s+0(?:\s|$)|true(?:\s|$))/iu;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

export function parseWorkspacePatterns(value) {
  if (typeof value !== "string") {
    fail("WORKSPACE_VALIDATION_YAML_STRING_REQUIRED");
  }
  const patterns = [];
  let inPackages = false;
  for (const raw of value.split(/\r?\n/u)) {
    const line = raw.replace(/\s+#.*$/u, "");
    if (!line.trim()) continue;
    if (/^packages\s*:\s*$/u.test(line.trim())) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const match = /^\s*-\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))\s*$/u.exec(line);
    if (!match) {
      if (/^\S/u.test(line)) break;
      continue;
    }
    const pattern = match[1] ?? match[2] ?? match[3];
    if (
      !pattern ||
      pattern.includes("\\") ||
      pattern.startsWith("/") ||
      /^[A-Za-z]:/u.test(pattern) ||
      pattern.split("/").some((part) => part === ".." || part === ".")
    ) {
      fail("WORKSPACE_VALIDATION_PATTERN_INVALID", String(pattern));
    }
    patterns.push(pattern);
  }
  if (!patterns.length) {
    fail("WORKSPACE_VALIDATION_PATTERNS_EMPTY");
  }
  return Object.freeze([...new Set(patterns)].sort());
}

async function pathExists(path) {
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
  let paths = [resolve(root)];
  for (const part of parts) {
    const next = [];
    for (const base of paths) {
      if (part === "*") {
        const entries = await readdir(base, { withFileTypes: true }).catch((error) => {
          if (error?.code === "ENOENT") return [];
          throw error;
        });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            next.push(resolve(base, entry.name));
          }
        }
      } else if (!part.includes("*")) {
        next.push(resolve(base, part));
      } else {
        fail("WORKSPACE_VALIDATION_PATTERN_UNSUPPORTED", pattern);
      }
    }
    paths = next;
  }
  return paths;
}

async function workspaceDirectories(root, patterns) {
  const output = new Map();
  for (const pattern of patterns) {
    for (const directory of await expandPattern(root, pattern)) {
      const packagePath = resolve(directory, "package.json");
      if (await pathExists(packagePath)) {
        output.set(relative(root, directory).split(sep).join("/"), directory);
      }
    }
  }
  return [...output.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function listFiles(directory, root) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    if (["node_modules", "dist", ".next", ".art-studio", "coverage"].includes(entry.name)) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      output.push(...await listFiles(path, root));
    } else if (entry.isFile()) {
      output.push(relative(root, path).split(sep).join("/"));
    }
  }
  return output;
}

function scriptIssue(name, command) {
  if (typeof command !== "string" || !command.trim()) return "missing";
  if (PLACEHOLDER.test(command)) return "placeholder";
  if (/\b(?:workflow_dispatch|GITHUB_TOKEN|VERCEL_TOKEN)\b/u.test(command)) {
    return "hosted-token-or-trigger";
  }
  if (/^(?:vercel|npx\s+vercel|pnpm\s+(?:dlx|exec)\s+vercel)(?:\s|$)/iu.test(command.trim())) {
    return "hosted-vercel";
  }
  if (/^gh\s+(?:workflow|run)(?:\s|$)/iu.test(command.trim())) {
    return "hosted-github-workflow";
  }
  return undefined;
}

export async function compileWorkspaceValidationCoverage(root = process.cwd()) {
  const repositoryRoot = resolve(root);
  const workspaceYaml = await readFile(
    resolve(repositoryRoot, "pnpm-workspace.yaml"),
    "utf8",
  );
  const patterns = parseWorkspacePatterns(workspaceYaml);
  const directories = await workspaceDirectories(repositoryRoot, patterns);
  const workspaces = [];
  const failures = [];

  for (const [workspacePath, directory] of directories) {
    let document;
    try {
      document = JSON.parse(
        await readFile(resolve(directory, "package.json"), "utf8"),
      );
    } catch (error) {
      fail(
        "WORKSPACE_VALIDATION_PACKAGE_JSON_INVALID",
        `${workspacePath}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const files = await listFiles(directory, directory);
    const sourceFiles = files.filter((path) =>
      path.startsWith("src/") && SOURCE_EXTENSION.test(path),
    );
    const testFiles = files.filter((path) => TEST_PATH.test(path));
    const hasTsconfig = files.includes("tsconfig.json");
    const scripts = document.scripts && typeof document.scripts === "object"
      ? document.scripts
      : {};
    const required = [];
    if (sourceFiles.length > 0 && hasTsconfig) required.push("build", "typecheck");
    if (testFiles.length > 0) required.push("test");
    const issues = [];
    for (const name of [...new Set(required)]) {
      const issue = scriptIssue(name, scripts[name]);
      if (issue) {
        const entry = Object.freeze({
          workspacePath,
          packageName: document.name ?? null,
          lifecycle: name,
          issue,
        });
        issues.push(entry);
        failures.push(entry);
      }
    }
    for (const name of ["build", "typecheck", "test"]) {
      if (!Object.hasOwn(scripts, name)) continue;
      const issue = scriptIssue(name, scripts[name]);
      if (issue && !issues.some((entry) => entry.lifecycle === name)) {
        const entry = Object.freeze({
          workspacePath,
          packageName: document.name ?? null,
          lifecycle: name,
          issue,
        });
        issues.push(entry);
        failures.push(entry);
      }
    }
    workspaces.push(Object.freeze({
      workspacePath,
      packageName: document.name ?? null,
      sourceFileCount: sourceFiles.length,
      testFileCount: testFiles.length,
      hasTsconfig,
      requiredLifecycles: Object.freeze([...new Set(required)].sort()),
      lifecycleScripts: Object.freeze({
        build: scripts.build ?? null,
        typecheck: scripts.typecheck ?? null,
        test: scripts.test ?? null,
      }),
      issues: Object.freeze(issues),
    }));
  }

  return Object.freeze({
    schema: WORKSPACE_VALIDATION_COVERAGE_SCHEMA,
    status: failures.length === 0 ? "passed" : "failed",
    workspacePatterns: patterns,
    workspaceCount: workspaces.length,
    workspaces: Object.freeze(workspaces),
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

export async function assertWorkspaceValidationCoverage(root = process.cwd()) {
  const report = await compileWorkspaceValidationCoverage(root);
  if (report.status !== "passed") {
    fail("WORKSPACE_VALIDATION_COVERAGE_FAILED", JSON.stringify(report.failures));
  }
  return report;
}
