#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const files = {
  compiler: "scripts/compile-foundation-media-plan.mjs",
  tests: "scripts/test-foundation-media-plan.mjs",
  docs: "docs/foundation-kit-media-production.md",
  example: "examples/foundation-kit-media-plan-request.json",
};

const read = (relative, maximum = 1_000_000) => {
  const absolute = path.resolve(root, relative);
  const relation = path.relative(root, absolute);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`FOUNDATION_MEDIA_PATH_ESCAPE:${relative}`);
  }
  if (!fs.existsSync(absolute)) throw new Error(`FOUNDATION_MEDIA_MISSING:${relative}`);
  const stats = fs.lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`FOUNDATION_MEDIA_FILE_INVALID:${relative}`);
  }
  if (stats.size > maximum) throw new Error(`FOUNDATION_MEDIA_FILE_TOO_LARGE:${relative}`);
  return fs.readFileSync(absolute, "utf8");
};

const requireTokens = (label, source, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} is missing ${token}`);
  }
};

const forbidTokens = (label, source, tokens) => {
  for (const token of tokens) {
    if (source.includes(token)) errors.push(`${label} contains prohibited ${token}`);
  }
};

try {
  const source = Object.fromEntries(
    Object.entries(files).map(([name, relative]) => [name, read(relative)]),
  );
  requireTokens("Foundation compiler", source.compiler, [
    "evavo_godot_media_production_contract_v1",
    "evavo_godot_media_production_plan_v1",
    "sourceFilesAreImmutable",
    "outputsAreUnapprovedUntilPromoted",
    "automaticDeletionAllowed",
    "partialBatchPublicationAllowed",
    "arbitraryShellAllowed",
    "arbitraryGitArgumentsAllowed",
    "forcePushAllowed",
    "auditRoles",
    "pathTokens",
    "ambiguous-role-classification",
    "meaningful-alpha-required",
    "exact-canvas-mismatch",
    "runtime-target-collision",
    "role.canvas === null",
    'fs.openSync(absolute, "wx", 0o600)',
    "publicationAuthority: false",
    "deletionAuthority: false",
    "humanCreativeApprovalRequired: true",
    "STRICT_PLAN_NOT_READY",
  ]);
  forbidTokens("Foundation compiler", source.compiler, [
    "git push",
    "git commit",
    "child_process",
    "execSync",
    "spawnSync",
    "rmSync(repositoryRoot",
    "unlinkSync",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
  ]);
  requireTokens("Foundation tests", source.tests, [
    "READY_PLAN_FAILED",
    "STRICT_ALPHA_BLOCKER_ACCEPTED",
    "PLANNING_BLOCKER_EVIDENCE_INVALID",
    "humanCreativeApprovalRequired",
    "meaningful-alpha-required",
  ]);
  requireTokens("Foundation documentation", source.docs, [
    "EVAVO-STUDIO/GodotGameFoundationKit",
    "EVAVO Art Studio",
    "EVAVO Audio Studio",
    "Godot Game Test Lab",
    "Godot Web Runtime",
    "EVAVO Development Studio",
    "MCP Tasks",
    "signed publication transaction",
  ]);

  let example;
  try {
    example = JSON.parse(source.example);
  } catch {
    errors.push("Foundation example is invalid JSON");
    example = {};
  }
  if (
    example.schemaVersion !== "1.0" ||
    example.repository !== "EVAVO-STUDIO/GodotGameFoundationKit" ||
    !String(example.contractPath ?? "").endsWith(
      "foundation_kit_media_production_contract_v1.json",
    ) ||
    example.outputPolicy?.publicationAuthority !== false ||
    example.outputPolicy?.deletionAuthority !== false ||
    example.outputPolicy?.humanCreativeApprovalRequired !== true
  ) {
    errors.push("Foundation example authority changed");
  }

  const test = spawnSync(
    process.execPath,
    [path.join(root, files.tests)],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    },
  );
  if (test.status !== 0) {
    errors.push(
      `Foundation compiler tests failed: ${test.stdout}\n${test.stderr}`,
    );
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  process.stderr.write("Foundation media-plan check failed:\n");
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Foundation media-plan check passed.\n" +
      "- exact contract and audit identities remain bound\n" +
      "- role ambiguity, alpha, canvas and target collisions fail closed\n" +
      "- planning remains create-only and publication-free\n",
  );
}
