import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const ROOT_VALIDATION_COVERAGE_SCHEMA =
  "evavo.art-studio.root-validation-coverage.v1";

const ROOT_SCRIPT_REFERENCE = Object.freeze([
  /^(?:pnpm|npm)\s+run\s+([A-Za-z0-9:_-]+)(?:\s|$)/u,
  /^(?:pnpm|npm)\s+(?!--)([A-Za-z0-9:_-]+)(?:\s|$)/u,
  /^yarn\s+(?:run\s+)?([A-Za-z0-9:_-]+)(?:\s|$)/u,
]);
const VALIDATION_FILE = /^(?:check[-_].+\.(?:mjs|cjs|js|py)|test[-_].+\.(?:mjs|cjs|js|py)|.+\.(?:test|spec)\.(?:mjs|cjs|js))$/u;
const GLOB_META = /[*?[]/u;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function normaliseCommand(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/\s+/gu, " ")
    .trim();
}

export function splitCommandChain(value) {
  if (typeof value !== "string") {
    fail("ROOT_VALIDATION_COMMAND_STRING_REQUIRED");
  }
  const commands = [];
  let current = "";
  let quote;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      current += character;
      continue;
    }
    const separator =
      (character === "&" && next === "&") ||
      (character === "|" && next === "|") ||
      character === ";";
    if (separator) {
      const command = normaliseCommand(current);
      if (command) commands.push(command);
      current = "";
      if (character !== ";") index += 1;
      continue;
    }
    current += character;
  }
  const command = normaliseCommand(current);
  if (command) commands.push(command);
  return Object.freeze(commands);
}

export function referencedRootScript(command, scripts) {
  const normalised = normaliseCommand(command);
  if (/^(?:pnpm|npm|yarn)\s+--filter\b/u.test(normalised)) return undefined;
  for (const pattern of ROOT_SCRIPT_REFERENCE) {
    const match = pattern.exec(normalised);
    if (match && Object.hasOwn(scripts, match[1])) return match[1];
  }
  return undefined;
}

function expandRootScript(name, scripts, stack = new Set()) {
  if (stack.has(name)) {
    fail("ROOT_VALIDATION_SCRIPT_CYCLE", [...stack, name].join(" -> "));
  }
  const command = scripts[name];
  if (typeof command !== "string") {
    fail("ROOT_VALIDATION_SCRIPT_MISSING", name);
  }
  const nextStack = new Set(stack);
  nextStack.add(name);
  const leafCommands = [];
  const referencedScripts = [];
  for (const atom of splitCommandChain(command)) {
    const reference = referencedRootScript(atom, scripts);
    if (!reference) {
      leafCommands.push(atom);
      continue;
    }
    referencedScripts.push(reference);
    const expanded = expandRootScript(reference, scripts, nextStack);
    leafCommands.push(...expanded.leafCommands);
    referencedScripts.push(...expanded.referencedScripts);
  }
  return Object.freeze({
    script: name,
    leafCommands: Object.freeze([...new Set(leafCommands.map(normaliseCommand))]),
    referencedScripts: Object.freeze([...new Set(referencedScripts)]),
  });
}

function packageLifecycle(command) {
  const match = /^(?:pnpm|npm)\s+--filter\s+\S+\s+(?:run\s+)?(build|test|typecheck)(?:\s|$)/u.exec(command);
  return match?.[1];
}

function leafCovered(leaf, reachableLeaves, reachableScripts) {
  const normalised = normaliseCommand(leaf);
  if (reachableLeaves.has(normalised)) return true;
  const lifecycle = packageLifecycle(normalised);
  if (lifecycle && reachableScripts.has(lifecycle)) return true;
  return false;
}

function globToRegExp(pattern) {
  let output = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        output += ".*";
        index += 1;
      } else {
        output += "[^/]*";
      }
    } else if (character === "?") {
      output += "[^/]";
    } else if (".()+^$|{}[]\\".includes(character)) {
      output += `\\${character}`;
    } else {
      output += character;
    }
  }
  return new RegExp(`${output}$`, "u");
}

function commandTokens(command) {
  const tokens = [];
  let current = "";
  let quote;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current) tokens.push(current);
  return tokens.map((entry) => entry.replaceAll("\\", "/"));
}

function directFileCoverage(path, commands) {
  for (const command of commands) {
    for (const token of commandTokens(command)) {
      const cleaned = token.replace(/^\.\//u, "");
      if (cleaned === path) return Object.freeze({ kind: "direct", command });
      if (GLOB_META.test(cleaned)) {
        try {
          if (globToRegExp(cleaned).test(path)) {
            return Object.freeze({ kind: "glob", command, pattern: cleaned });
          }
        } catch {
          // A non-path shell token may contain glob characters. Ignore it.
        }
      }
    }
  }
  return undefined;
}

async function listFiles(directory, root) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...await listFiles(path, root));
    } else if (entry.isFile()) {
      output.push(relative(root, path).split(sep).join("/"));
    }
  }
  return output;
}

function validationKind(path) {
  const name = path.split("/").at(-1) ?? path;
  if (/^check[-_]/u.test(name)) return "check";
  return "test";
}

function isRootCheckScript(name) {
  return name === "check" || name.endsWith(":check");
}

export async function compileRootValidationCoverage(root = process.cwd()) {
  const repositoryRoot = resolve(root);
  const packageDocument = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const scripts = packageDocument.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    fail("ROOT_VALIDATION_PACKAGE_SCRIPTS_INVALID");
  }
  if (typeof scripts.check !== "string") {
    fail("ROOT_VALIDATION_ROOT_CHECK_MISSING");
  }

  const expandedCheck = expandRootScript("check", scripts);
  const reachableScripts = new Set(["check", ...expandedCheck.referencedScripts]);
  const reachableLeaves = new Set(expandedCheck.leafCommands);
  const rootChecks = [];
  for (const name of Object.keys(scripts).sort()) {
    if (!isRootCheckScript(name)) continue;
    if (reachableScripts.has(name)) {
      rootChecks.push(Object.freeze({ name, status: "reachable" }));
      continue;
    }
    const expanded = expandRootScript(name, scripts);
    const missingLeaves = expanded.leafCommands.filter(
      (leaf) => !leafCovered(leaf, reachableLeaves, reachableScripts),
    );
    rootChecks.push(Object.freeze({
      name,
      status: missingLeaves.length === 0 ? "subsumed" : "outside-root-check",
      missingLeaves: Object.freeze(missingLeaves),
    }));
  }

  const allScriptCommands = Object.values(scripts)
    .filter((value) => typeof value === "string")
    .flatMap(splitCommandChain)
    .map(normaliseCommand);
  const reachableCommands = [...reachableLeaves];
  const scriptFiles = await listFiles(resolve(repositoryRoot, "scripts"), repositoryRoot);
  const validationFiles = scriptFiles
    .filter((path) => VALIDATION_FILE.test(path.split("/").at(-1) ?? path))
    .sort();
  const regressionFiles = validationFiles.map((path) => {
    const rootCoverage = directFileCoverage(path, reachableCommands);
    const anyCoverage = rootCoverage ?? directFileCoverage(path, allScriptCommands);
    return Object.freeze({
      path,
      kind: validationKind(path),
      status: rootCoverage
        ? "root-check"
        : anyCoverage
          ? "script-only"
          : "unreferenced",
      coverage: anyCoverage,
    });
  });

  const outsideRootChecks = rootChecks.filter(
    (entry) => entry.status === "outside-root-check",
  );
  const unreferencedMediaRegressions = regressionFiles.filter(
    (entry) =>
      entry.path.startsWith("scripts/test-ci-media-tool-") &&
      entry.status !== "root-check",
  );

  return Object.freeze({
    schema: ROOT_VALIDATION_COVERAGE_SCHEMA,
    status:
      outsideRootChecks.length === 0 &&
      unreferencedMediaRegressions.length === 0
        ? "passed"
        : "failed",
    rootScript: "check",
    reachableScripts: Object.freeze([...reachableScripts].sort()),
    reachableLeafCommandCount: reachableLeaves.size,
    rootChecks: Object.freeze(rootChecks),
    validationFileCount: regressionFiles.length,
    regressionFiles: Object.freeze(regressionFiles),
    failures: Object.freeze({
      outsideRootChecks: Object.freeze(outsideRootChecks),
      unreferencedMediaRegressions: Object.freeze(unreferencedMediaRegressions),
    }),
    inventory: Object.freeze({
      scriptOnlyValidationFiles: Object.freeze(
        regressionFiles.filter((entry) => entry.status === "script-only"),
      ),
      unreferencedValidationFiles: Object.freeze(
        regressionFiles.filter((entry) => entry.status === "unreferenced"),
      ),
    }),
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

export async function assertRootValidationCoverage(root = process.cwd()) {
  const report = await compileRootValidationCoverage(root);
  if (report.status !== "passed") {
    fail(
      "ROOT_VALIDATION_COVERAGE_FAILED",
      JSON.stringify(report.failures),
    );
  }
  return report;
}
