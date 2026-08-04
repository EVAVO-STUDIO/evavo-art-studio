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
  workflow: ".github/workflows/foundation-media-plan-authority.yml",
};

const read = (relative, maximum = 1_500_000) => {
  const absolute = path.resolve(root, relative);
  const relation = path.relative(root, absolute);
  if (
    relation.startsWith(`..${path.sep}`) ||
    relation === ".." ||
    path.isAbsolute(relation)
  ) {
    throw new Error(`FOUNDATION_MEDIA_PATH_ESCAPE:${relative}`);
  }
  if (!fs.existsSync(absolute)) {
    throw new Error(`FOUNDATION_MEDIA_MISSING:${relative}`);
  }
  const stats = fs.lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`FOUNDATION_MEDIA_FILE_INVALID:${relative}`);
  }
  if (stats.size > maximum) {
    throw new Error(`FOUNDATION_MEDIA_FILE_TOO_LARGE:${relative}`);
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireTokens = (label, source, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} is missing ${token}`);
  }
};

const forbidTokens = (label, source, tokens) => {
  for (const token of tokens) {
    if (source.includes(token)) {
      errors.push(`${label} contains prohibited ${token}`);
    }
  }
};

const run = (label, command, args, timeout = 60_000) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
  if (result.status !== 0) {
    errors.push(
      `${label} failed: ${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
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
    "AUDIT_ROOT_MISMATCH",
    "AUDIT_ROW_SHA256_INVALID",
    "SYMLINK_PATH_FORBIDDEN",
    "OUTPUT_INSIDE_REPOSITORY",
    "ambiguous-role-classification",
    "meaningful-alpha-required",
    "exact-canvas-mismatch",
    "runtime-target-collision",
    "windows-reserved-runtime-name",
    "role.canvas === null",
    'fs.openSync(absolute, "wx", 0o600)',
    "planFileCreated: true",
    "mutationPerformed: true",
    'mutationScope: "create-only-plan-file"',
    "targetRepositoryMutationPerformed: false",
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
    "STRICT_ALPHA_BLOCKER",
    "PLANNING_BLOCKER_EVIDENCE_INVALID",
    "AUDIT_ROOT_MISMATCH",
    "MALFORMED_AUDIT_SHA",
    "TARGET_REPOSITORY_OUTPUT",
    "COLLISION_DID_NOT_BLOCK_ALL_MEMBERS",
    "WINDOWS_RESERVED_RUNTIME_NAME_ACCEPTED",
    "SYMLINKED_CONTRACT",
    "targetRepositoryMutationPerformed",
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
    "Audit-root binding",
    "Symlink rejection",
    "Output isolation",
    "Collision completeness",
    "create-only plan file",
  ]);

  requireTokens("Foundation workflow", source.workflow, [
    "name: Foundation Media Plan Authority",
    "ubuntu-24.04",
    "node-version: \"22.14.0\"",
    "node scripts/check-foundation-media-plan.mjs",
    "git diff --exit-code",
    "foundation-media-plan-authority-${{ github.sha }}",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
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
    example.outputPolicy?.createOnly !== true ||
    example.outputPolicy?.publicationAuthority !== false ||
    example.outputPolicy?.deletionAuthority !== false ||
    example.outputPolicy?.humanCreativeApprovalRequired !== true
  ) {
    errors.push("Foundation example authority changed");
  }

  for (const relative of [files.compiler, files.tests, "scripts/check-foundation-media-plan.mjs"]) {
    run(`Syntax check ${relative}`, process.execPath, ["--check", path.join(root, relative)]);
  }
  run(
    "Foundation compiler tests",
    process.execPath,
    [path.join(root, files.tests)],
    90_000,
  );
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
      "- exact contract, repository and audit identities remain bound\n" +
      "- malformed rows, symlinked authorities and target-repository output fail closed\n" +
      "- ambiguity, alpha, canvas, reserved-name and all-member collision blockers are complete\n" +
      "- plan creation is create-only, truthful and publication-free\n",
  );
}
