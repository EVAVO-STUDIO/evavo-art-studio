import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  referencedRootScript,
  splitCommandChain,
} from "./lib/root-validation-coverage.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function firstTokens(command) {
  const output = [];
  let current = "";
  let quote;
  for (const character of command.trim()) {
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
      if (current) output.push(current);
      current = "";
      if (output.length >= 5) break;
      continue;
    }
    current += character;
  }
  if (current && output.length < 5) output.push(current);
  return output;
}

function collectLeaves(name, scripts, active = new Set()) {
  if (active.has(name)) throw new Error(`script cycle: ${[...active, name].join(" -> ")}`);
  const next = new Set(active);
  next.add(name);
  const leaves = [];
  for (const command of splitCommandChain(scripts[name])) {
    const reference = referencedRootScript(command, scripts);
    if (reference) leaves.push(...collectLeaves(reference, scripts, next));
    else leaves.push(command);
  }
  return leaves;
}

function hostedReason(command) {
  const tokens = firstTokens(command).map((entry) => entry.toLocaleLowerCase("en-US"));
  if (!tokens.length) return undefined;
  if (tokens[0] === "vercel") return "direct-vercel";
  if (
    (tokens[0] === "npx" || tokens[0] === "pnpx") &&
    tokens[1] === "vercel"
  ) {
    return "package-runner-vercel";
  }
  if (
    tokens[0] === "pnpm" &&
    ["dlx", "exec"].includes(tokens[1]) &&
    tokens[2] === "vercel"
  ) {
    return "pnpm-vercel";
  }
  if (tokens[0] === "gh") {
    if (["workflow", "run"].includes(tokens[1])) return "github-workflow";
    if (tokens[1] === "api" && /(?:^|\/)actions(?:\/|$)/iu.test(command)) {
      return "github-actions-api";
    }
  }
  if (
    ["curl", "wget", "invoke-webrequest", "iwr"].includes(tokens[0]) &&
    /(?:api\.github\.com\/.+\/actions|github\.com\/.+\/actions)/iu.test(command)
  ) {
    return "github-actions-http";
  }
  if (/\bworkflow_dispatch\b/iu.test(command)) return "workflow-dispatch";
  if (/\b(?:GITHUB_TOKEN|VERCEL_TOKEN)\b/u.test(command)) return "hosted-token";
  return undefined;
}

test("the complete local gate contains no hosted execution command", async () => {
  const document = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const leaves = collectLeaves("check", document.scripts);
  const violations = leaves
    .map((command) => ({ command, reason: hostedReason(command) }))
    .filter((entry) => entry.reason);
  assert.deepEqual(violations, []);
  assert.ok(
    leaves.some((command) =>
      command.includes("check-github-workflow-contexts.mjs"),
    ),
    "the root gate must retain the zero-hosted-workflow policy check",
  );
});

test("the executable GitHub workflow directory contains policy documentation only", async () => {
  const directory = path.join(repositoryRoot, ".github", "workflows");
  const entries = await readdir(directory, { withFileTypes: true });
  const executable = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(executable, []);
  assert.ok(entries.some((entry) => entry.isFile() && entry.name === "README.md"));
});
